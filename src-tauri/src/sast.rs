//! SAST Engine — tree-sitter pattern scanning (real implementation)
//!
//! Pipeline: JSON rules → per-language compiled `Query` pool → parse file once →
//! run every applicable rule's query → capture spans mapped to line/col →
//! findings (+ SARIF 2.1.0 export).
//!
//! Rule file format (user-customizable; drop extra *.json into the rules dir):
//! ```json
//! {
//!   "id": "xss-inner-html",
//!   "severity": "high",
//!   "message": "innerHTML sink",
//!   "cwe": ["CWE-79"],
//!   "tags": ["xss"],
//!   "queries": {
//!     "javascript": "(assignment_expression left: (member_expression property: (property_identifier) @prop (#eq? @prop \"innerHTML\"))) @match"
//!   }
//! }
//! ```
//! Convention: the capture named `@match` marks the reported span. Rules simply
//! don't fire on languages they have no query for. Invalid user queries fail
//! loudly at load time — silent skips hide typos in security rules.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context as _, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tree_sitter::{Parser, Query, QueryCursor};

// ============================================================================
// Rule model
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

impl Severity {
    fn sarif_level(self) -> &'static str {
        match self {
            Self::Critical | Self::High => "error",
            Self::Medium => "warning",
            Self::Low | Self::Info => "note",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SastRule {
    pub id: String,
    pub severity: Severity,
    pub message: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub cwe: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// language-id (`"typescript"`, `"python"`, …) → tree-sitter S-expression.
    #[serde(default)]
    pub queries: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub rule_id: String,
    pub severity: Severity,
    pub message: String,
    pub file: String,
    /// 1-based.
    pub line: u32,
    /// 1-based, byte offset within the line (tree-sitter columns are bytes).
    pub column: u32,
    pub end_line: u32,
    pub snippet: String,
    #[serde(default)]
    pub cwe: Vec<String>,
}

// ============================================================================
// Languages
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Lang {
    TypeScript,
    JavaScript,
    Python,
    Rust,
    Go,
    Cpp,
    C,
    CSharp,
    Php,
    Ruby,
    Html,
    Css,
    Json,
}

impl Lang {
    fn from_path(p: &Path) -> Option<Self> {
        let ext = p.extension()?.to_str()?.to_ascii_lowercase();
        Some(match ext.as_str() {
            "ts" | "tsx" | "mts" | "cts" => Self::TypeScript,
            "js" | "jsx" | "mjs" | "cjs" => Self::JavaScript,
            "py" | "pyw" => Self::Python,
            "rs" => Self::Rust,
            "go" => Self::Go,
            "cpp" | "cc" | "cxx" | "hpp" | "hh" => Self::Cpp,
            "c" | "h" => Self::C,
            "cs" => Self::CSharp,
            "php" | "phtml" => Self::Php,
            "rb" => Self::Ruby,
            "html" | "htm" => Self::Html,
            "css" | "scss" | "less" => Self::Css,
            "json" | "jsonc" => Self::Json,
            _ => return None,
        })
    }

    fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "typescript" | "tsx" => Self::TypeScript,
            "javascript" => Self::JavaScript,
            "python" => Self::Python,
            "rust" => Self::Rust,
            "go" => Self::Go,
            "cpp" | "c++" => Self::Cpp,
            "c" => Self::C,
            "csharp" | "c#" => Self::CSharp,
            "php" => Self::Php,
            "ruby" => Self::Ruby,
            "html" => Self::Html,
            "css" => Self::Css,
            "json" => Self::Json,
            _ => return None,
        })
    }

    fn id(self) -> &'static str {
        match self {
            Self::TypeScript => "typescript",
            Self::JavaScript => "javascript",
            Self::Python => "python",
            Self::Rust => "rust",
            Self::Go => "go",
            Self::Cpp => "cpp",
            Self::C => "c",
            Self::CSharp => "csharp",
            Self::Php => "php",
            Self::Ruby => "ruby",
            Self::Html => "html",
            Self::Css => "css",
            Self::Json => "json",
        }
    }

    fn make_parser(self) -> Result<Parser, String> {
        let mut p = Parser::new();
        // Grammar crates ship `LANGUAGE` consts compatible with runtime 0.24.
        let res = match self {
            Self::TypeScript => p.set_language(&tree_sitter_typescript::LANGUAGE_TYPESCRIPT),
            Self::JavaScript => p.set_language(&tree_sitter_javascript::LANGUAGE),
            Self::Python => p.set_language(&tree_sitter_python::LANGUAGE),
            Self::Rust => p.set_language(&tree_sitter_rust::LANGUAGE),
            Self::Go => p.set_language(&tree_sitter_go::LANGUAGE),
            Self::Cpp => p.set_language(&tree_sitter_cpp::LANGUAGE),
            Self::C => p.set_language(&tree_sitter_c::LANGUAGE),
            Self::CSharp => p.set_language(&tree_sitter_c_sharp::LANGUAGE),
            Self::Php => p.set_language(&tree_sitter_php::LANGUAGE_PHP),
            Self::Ruby => p.set_language(&tree_sitter_ruby::LANGUAGE),
            Self::Html => p.set_language(&tree_sitter_html::LANGUAGE),
            Self::Css => p.set_language(&tree_sitter_css::LANGUAGE),
            Self::Json => p.set_language(&tree_sitter_json::LANGUAGE),
        };
        res.map_err(|e| format!("grammar '{}' failed to load: {e}", self.id()))?;
        Ok(p)
    }
}

// ============================================================================
// Compilation cache
// ============================================================================

struct Compiled {
    rule_index: usize,
    query: Query,
}

fn compile_rules(rules: &[SastRule]) -> Result<HashMap<Lang, Vec<Compiled>>> {
    let mut out: HashMap<Lang, Vec<Compiled>> = HashMap::new();
    for (idx, rule) in rules.iter().enumerate() {
        for (lang_id, sexp) in &rule.queries {
            let lang = Lang::from_id(lang_id).ok_or_else(|| {
                anyhow::anyhow!("rule '{}' targets unknown language '{lang_id}'", rule.id)
            })?;
            let ts_lang = tree_language_of(lang);
            let q = Query::new(&ts_lang, sexp)
                .with_context(|| format!("rule '{}' ({lang_id}) invalid query", rule.id))?;
            out.entry(lang).or_default().push(Compiled { rule_index: idx, query: q });
        }
    }
    Ok(out)
}

/// Per-language tree-sitter `Language` handle used for Query compilation.
fn tree_language_of(lang: Lang) -> tree_sitter::Language {
    // Grammar consts are plain values; referencing them here keeps a single
    // place that must compile when grammar versions move.
    unsafe { std::mem::transmute(grammar_fn_of(lang)) }
}

#[cfg(any())]
mod _doc {
    // grammar_fn_of returns the raw LanguageFn-equivalent from each crate;
    // transmute is version-pairing glue pinned in Cargo.toml comments.
}

fn grammar_fn_of(
    lang: Lang,
) -> tree_sitter_languages::LangFn {
    use tree_sitter_languages::LangFn as L;
    match lang {
        Lang::TypeScript => L::Ts(tree_sitter_typescript::LANGUAGE_TYPESCRIPT),
        Lang::JavaScript => L::Js(tree_sitter_javascript::LANGUAGE),
        Lang::Python => L::Py(tree_sitter_python::LANGUAGE),
        Lang::Rust => L::Rs(tree_sitter_rust::LANGUAGE),
        Lang::Go => L::Go(tree_sitter_go::LANGUAGE),
        Lang::Cpp => L::Cpp(tree_sitter_cpp::LANGUAGE),
        Lang::C => L::C(tree_sitter_c::LANGUAGE),
        Lang::CSharp => L::Cs(tree_sitter_c_sharp::LANGUAGE),
        Lang::Php => L::Php(tree_sitter_php::LANGUAGE_PHP),
        Lang::Ruby => L::Rb(tree_sitter_ruby::LANGUAGE),
        Lang::Html => L::Html(tree_sitter_html::LANGUAGE),
        Lang::Css => L::Css(tree_sitter_css::LANGUAGE),
        Lang::Json => L::Json(tree_sitter_json::LANGUAGE),
        _ => unreachable!("every Lang has a grammar"),
    }
}
