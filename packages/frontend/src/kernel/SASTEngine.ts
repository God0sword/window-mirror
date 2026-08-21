/**
 * Window Mirror - Tree-sitter SAST Engine
 * 
 * Based on patterns from:
 * - Sighthound (Corgea): tree-sitter + RON rules, pattern + taint mode
 * - nyx-scanner: multi-language, SSA-based dataflow, cross-file taint
 * - the-janitor: 23 tree-sitter grammars, IFDS taint solver, Kani/Z3 verification
 * - AEGIS: 14 languages, inter-procedural call graph, cross-file taint
 */

import type {
  Plugin, PluginManifest, PluginInstance,
  KernelPrimitives, Subscription
} from './BrowserKernel';

// ============================================================================
// TREE-SITTER SAST TYPES
// ============================================================================

export type LanguageId = 
  | 'typescript' | 'javascript' | 'python' | 'rust' | 'go' 
  | 'java' | 'c' | 'cpp' | 'csharp' | 'php' | 'ruby' 
  | 'swift' | 'kotlin' | 'scala' | 'html' | 'css' | 'json';

export interface SASTRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cwe?: string[];
  owasp?: string[];
  language: LanguageId | LanguageId[];
  mode: 'pattern' | 'taint';
  pattern?: string;           // tree-sitter query for pattern mode
  taint?: TaintRule;          // taint rule for taint mode
  tags: string[];
  metadata?: Record<string, any>;
}

export interface TaintRule {
  sources: TaintSource[];
  sinks: TaintSink[];
  sanitizers?: TaintSanitizer[];
  propagation: PropagationRule[];
}

export interface TaintSource {
  type: 'parameter' | 'field' | 'variable' | 'call' | 'return';
  pattern: string;            // tree-sitter query
  label: string;
}

export interface TaintSink {
  type: 'call' | 'assignment' | 'return' | 'field';
  pattern: string;            // tree-sitter query
  label: string;
  cwe: string;
}

export interface TaintSanitizer {
  type: 'call' | 'function';
  pattern: string;            // tree-sitter query
  label: string;
}

export interface PropagationRule {
  from: string;               // node type
  to: string;                 // node type
  operation: 'assignment' | 'call' | 'return' | 'field' | 'index' | 'binary';
}

export interface SASTFinding {
  ruleId: string;
  ruleName: string;
  severity: SASTRule['severity'];
  message: string;
  file: string;
  location: SourceLocation;
  codeSnippet: string;
  taintPath?: TaintPathStep[];
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
}

export interface SourceLocation {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface TaintPathStep {
  file: string;
  location: SourceLocation;
  description: string;
  nodeType: string;
}

export interface ScanResult {
  findings: SASTFinding[];
  filesScanned: number;
  linesScanned: number;
  durationMs: number;
  languageStats: Record<LanguageId, { files: number; findings: number }>;
}

export interface ScanConfig {
  rootPath: string;
  languages?: LanguageId[];
  rules?: SASTRule[];
  mode?: 'pattern' | 'taint' | 'both';
  maxFiles?: number;
  maxFileSize?: number;
  excludePatterns?: string[];
  includePatterns?: string[];
  parallel?: boolean;
  outputFormat?: 'json' | 'sarif' | 'text' | 'csv';
}

// ============================================================================
// LANGUAGE REGISTRY
// ============================================================================

export interface LanguageSupport {
  id: LanguageId;
  name: string;
  extensions: string[];
  treeSitterLanguage: () => Promise<any>;  // tree-sitter language module
  treeSitterWasm?: () => Promise<Uint8Array>; // pre-compiled WASM grammar
  queries: {
    pattern?: string;
    taintSources?: string;
    taintSinks?: string;
    taintSanitizers?: string;
    imports?: string;
    calls?: string;
  };
  lsp?: {
    command: string;
    args: string[];
  };
}

export const LANGUAGE_REGISTRY: Record<LanguageId, LanguageSupport> = {
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {
      pattern: `
        (call_expression
          function: (member_expression) @method
          (#match? @method "eval|Function|setTimeout|setInterval|innerHTML|outerHTML|insertAdjacentHTML"))
      `,
      taintSources: `
        (call_expression
          function: (identifier) @func
          (#match? @func "request\\.body|request\\.query|request\\.params|req\\.body|req\\.query|req\\.params"))
      `,
      taintSinks: `
        (call_expression
          function: (member_expression) @method
          (#match? @method "query|execute|exec|eval|innerHTML|write|sendFile"))
      `,
      imports: `
        (import_statement
          (string) @source)
        (import_clause
          (named_imports
            (import_specifier) @specifier))
      `,
      calls: `
        (call_expression
          function: (identifier) @name)
      `
    }
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {
      pattern: `
        (call_expression
          function: (member_expression) @method
          (#match? @method "eval|Function|setTimeout|setInterval|innerHTML|outerHTML|insertAdjacentHTML"))
      `
    }
  },
  python: {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyw', '.pyi'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {
      pattern: `
        (call
          function: (attribute
            attribute: (identifier) @method)
          (#match? @method "eval|exec|compile|subprocess\\.|os\\.system|pickle\\.loads|yaml\\.load"))
      `
    }
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {
      pattern: `
        (macro_invocation
          macro: (identifier) @name
          (#match? @name "unwrap|expect|panic|std::fs::|std::process::Command"))
      `
    }
  },
  go: {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  java: {
    id: 'java',
    name: 'Java',
    extensions: ['.java'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  c: {
    id: 'c',
    name: 'C',
    extensions: ['.c', '.h'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    extensions: ['.cs'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  php: {
    id: 'php',
    name: 'PHP',
    extensions: ['.php', '.phtml'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['.rb'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    extensions: ['.swift'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extensions: ['.kt', '.kts'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  scala: {
    id: 'scala',
    name: 'Scala',
    extensions: ['.scala'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  html: {
    id: 'html',
    name: 'HTML',
    extensions: ['.html', '.htm', '.xhtml'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  css: {
    id: 'css',
    name: 'CSS',
    extensions: ['.css', '.scss', '.sass', '.less'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  },
  json: {
    id: 'json',
    name: 'JSON',
    extensions: ['.json', '.jsonc'],
    treeSitterLanguage: async () => null, // grammar loading moves to Rust backend (debt D5)
    queries: {}
  }
};

// ============================================================================
// BUILT-IN RULES (Pattern-based, from Sighthound/nyx patterns)
// ============================================================================

export const BUILTIN_SAST_RULES: SASTRule[] = [
  // XSS Rules
  {
    id: 'xss-inner-html',
    name: 'Direct innerHTML Assignment',
    description: 'User-controlled data assigned to innerHTML without sanitization',
    severity: 'high',
    cwe: ['CWE-79'],
    owasp: ['A03:2021'],
    language: ['typescript', 'javascript'],
    mode: 'pattern',
    pattern: `
      (assignment_expression
        left: (member_expression
          property: (property_identifier) @prop
          (#eq? @prop "innerHTML"))
        right: (identifier) @value)
    `,
    tags: ['xss', 'dom', 'client-side'],
    metadata: { category: 'injection' }
  },
  {
    id: 'xss-document-write',
    name: 'Document Write with User Input',
    description: 'document.write() with user-controlled data',
    severity: 'high',
    cwe: ['CWE-79'],
    language: ['typescript', 'javascript'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          object: (identifier) @obj
          property: (property_identifier) @method
          (#eq? @obj "document")
          (#eq? @method "write"))
        arguments: (arguments (identifier) @value))
    `,
    tags: ['xss', 'dom', 'legacy']
  },
  
  // SQL Injection Rules
  {
    id: 'sql-injection-concat',
    name: 'SQL Query String Concatenation',
    description: 'SQL query built via string concatenation with user input',
    severity: 'critical',
    cwe: ['CWE-89'],
    owasp: ['A03:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "query|execute|exec|prepare"))
        arguments: (arguments
          (binary_expression
            operator: "+"
            right: (identifier) @value)))
    `,
    tags: ['sqli', 'injection', 'database']
  },
  {
    id: 'sql-injection-template',
    name: 'SQL Template Literal Injection',
    description: 'SQL query using template literal with user input',
    severity: 'critical',
    cwe: ['CWE-89'],
    language: ['typescript', 'javascript'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "query|execute|exec"))
        arguments: (arguments (template_string) @template))
    `,
    tags: ['sqli', 'injection', 'database']
  },
  
  // Command Injection Rules
  {
    id: 'cmd-injection-shell',
    name: 'Shell Command Injection',
    description: 'User input passed to shell command execution',
    severity: 'critical',
    cwe: ['CWE-78'],
    owasp: ['A03:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "exec|spawn|system|popen|shell|runCommand"))
        arguments: (arguments (binary_expression) @concat))
    `,
    tags: ['rce', 'injection', 'command']
  },
  
  // Path Traversal Rules
  {
    id: 'path-traversal',
    name: 'Path Traversal via User Input',
    description: 'File path constructed from user input without validation',
    severity: 'high',
    cwe: ['CWE-22'],
    owasp: ['A01:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "readFile|writeFile|open|createReadStream|createWriteStream|sendFile"))
        arguments: (arguments
          (binary_expression
            operator: "+"
            right: (identifier) @value)))
    `,
    tags: ['path-traversal', 'file-access', 'lfi']
  },
  
  // Hardcoded Secrets
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Secret',
    description: 'API key, password, or token hardcoded in source',
    severity: 'high',
    cwe: ['CWE-798'],
    owasp: ['A07:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (lexical_declaration
        (variable_declarator
          name: (identifier) @name
          (#match? @name "API_KEY|SECRET|PASSWORD|TOKEN|API_SECRET|ACCESS_KEY|PRIVATE_KEY")
          value: (string) @value))
    `,
    tags: ['secrets', 'credentials', 'configuration']
  },
  
  // Weak Crypto
  {
    id: 'weak-crypto-md5',
    name: 'MD5 Hash Usage',
    description: 'MD5 is cryptographically broken and should not be used',
    severity: 'medium',
    cwe: ['CWE-327'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "md5|createHash.*md5")))
    `,
    tags: ['crypto', 'weak-hash', 'deprecated']
  },
  {
    id: 'weak-crypto-sha1',
    name: 'SHA1 Hash Usage',
    description: 'SHA1 is cryptographically weak and should not be used for security',
    severity: 'medium',
    cwe: ['CWE-327'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "sha1|createHash.*sha1")))
    `,
    tags: ['crypto', 'weak-hash', 'deprecated']
  },
  
  // Insecure Random
  {
    id: 'insecure-random',
    name: 'Insecure Random Number Generation',
    description: 'Math.random() used for security-sensitive operations',
    severity: 'medium',
    cwe: ['CWE-338'],
    language: ['typescript', 'javascript'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          object: (identifier) @obj
          property: (property_identifier) @method
          (#eq? @obj "Math")
          (#eq? @method "random")))
    `,
    tags: ['crypto', 'randomness', 'prng']
  },
  
  // Prototype Pollution
  {
    id: 'prototype-pollution',
    name: 'Prototype Pollution',
    description: 'Object merge/extend with user-controlled keys',
    severity: 'high',
    cwe: ['CWE-1321'],
    language: ['typescript', 'javascript'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "assign|merge|extend|defaults|deepExtend"))
        arguments: (arguments (identifier) @obj))
    `,
    tags: ['prototype-pollution', 'object-injection']
  },
  
  // SSRF
  {
    id: 'ssrf-fetch',
    name: 'Server-Side Request Forgery (SSRF)',
    description: 'User-controlled URL passed to fetch/http request',
    severity: 'high',
    cwe: ['CWE-918'],
    owasp: ['A10:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (identifier) @func
        (#match? @func "fetch|axios|request|http\\.get|http\\.post|axios\\.get|axios\\.post|superagent|got|node-fetch")
        arguments: (arguments (identifier) @url))
    `,
    tags: ['ssrf', 'network', 'server-side']
  },
  
  // Open Redirect
  {
    id: 'open-redirect',
    name: 'Open Redirect',
    description: 'User-controlled redirect URL without validation',
    severity: 'medium',
    cwe: ['CWE-601'],
    owasp: ['A01:2021'],
    language: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'php', 'ruby'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "redirect|location\\.href|window\\.location"))
        arguments: (arguments (identifier) @url))
    `,
    tags: ['redirect', 'client-side', 'phishing']
  },
  
  // Insecure Deserialization
  {
    id: 'insecure-deserialization',
    name: 'Insecure Deserialization',
    description: 'User-controlled data passed to deserialization function',
    severity: 'critical',
    cwe: ['CWE-502'],
    owasp: ['A08:2021'],
    language: ['typescript', 'javascript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "parse|deserialize|unserialize|loads|load|fromJson|JSON\\.parse"))
        arguments: (arguments (identifier) @value))
    `,
    tags: ['deserialization', 'rce', 'data-integrity']
  },
  
  // XXE
  {
    id: 'xxe-xml',
    name: 'XML External Entity (XXE)',
    description: 'XML parser configured to resolve external entities',
    severity: 'high',
    cwe: ['CWE-611'],
    owasp: ['A05:2021'],
    language: ['typescript', 'javascript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    mode: 'pattern',
    pattern: `
      (call_expression
        function: (member_expression
          property: (property_identifier) @method
          (#match? @method "parse|load|loadXML|parseFromString"))
        arguments: (arguments
          (binary_expression) @concat))
    `,
    tags: ['xxe', 'xml', 'injection']
  }
];

// ============================================================================
// SAST ENGINE PLUGIN
// ============================================================================

export const SAST_ENGINE_PLUGIN: Plugin = {
  manifest: {
    id: 'window-mirror.sast',
    name: 'SAST Engine',
    version: '1.0.0',
    description: 'Tree-sitter based static analysis with pattern matching and taint flow analysis',
    author: 'Window Mirror',
    license: 'MIT',
    main: 'window-mirror/sast/engine',
    permissions: {
      network: false,
      filesystem: true,
      clipboard: false,
      notifications: true,
      geolocation: false,
      camera: false,
      microphone: false,
      custom: ['sast', 'tree-sitter']
    },
    dependencies: [],
    optionalDependencies: [],
    ui: {
      sidebarPanels: [{
        id: 'sast-findings',
        title: 'SAST Findings',
        icon: '🛡️',
        component: 'SASTFindingsPanel',
        defaultOpen: false,
        order: 10
      }],
      commands: [
        { id: 'sast.scan', title: 'Scan Project', action: 'sast.scanProject', category: 'Security' },
        { id: 'sast.scan-file', title: 'Scan Current File', action: 'sast.scanFile', category: 'Security' },
        { id: 'sast.clear', title: 'Clear Findings', action: 'sast.clearFindings', category: 'Security' },
        { id: 'sast.export', title: 'Export SARIF', action: 'sast.exportSarif', category: 'Security' }
      ],
      shortcuts: [
        { key: 'Ctrl+Shift+S', command: 'sast.scanProject', description: 'Scan project for vulnerabilities' },
        { key: 'Ctrl+Shift+F', command: 'sast.scanFile', description: 'Scan current file' }
      ]
    },
    overrides: [
      { target: 'devtools.custom', priority: 100, component: 'SASTPanel' }
    ]
  },
  instance: {
    async onLoad(kernel) {
      console.log('[SAST] Engine loaded');
    },
    async onEnable() {
      console.log('[SAST] Engine enabled');
    },
    async onDisable() {
      console.log('[SAST] Engine disabled');
    }
  },
  enabled: true,
  config: { enabled: true, settings: {} }
};

// ============================================================================
// SAST SCANNER IMPLEMENTATION (TypeScript - runs in web worker)
// ============================================================================

export class SASTScanner {
  private rules: SASTRule[];
  private languageCache = new Map<LanguageId, any>();
  private parserCache = new Map<LanguageId, any>();
  
  constructor(rules: SASTRule[] = BUILTIN_SAST_RULES) {
    this.rules = rules;
  }
  
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = performance.now();
    const findings: SASTFinding[] = [];
    let filesScanned = 0;
    let linesScanned = 0;
    const languageStats: Record<string, { files: number; findings: number }> = {};
    
    // Discover files
    const files = await this.discoverFiles(config);
    
    for (const file of files) {
      const content = await this.readFile(file);
      if (!content) continue;
      
      const language = this.detectLanguage(file);
      if (!language || (config.languages && !config.languages.includes(language))) continue;
      
      const fileFindings = await this.scanFile(file, content, language, config);
      findings.push(...fileFindings);
      
      filesScanned++;
      linesScanned += content.split('\n').length;
      
      if (!languageStats[language]) {
        languageStats[language] = { files: 0, findings: 0 };
      }
      languageStats[language].files++;
      languageStats[language].findings += fileFindings.length;
    }
    
    return {
      findings,
      filesScanned,
      linesScanned,
      durationMs: performance.now() - startTime,
      languageStats
    };
  }
  
  private async discoverFiles(config: ScanConfig): Promise<string[]> {
    // In real implementation, use kernel's filesystem
    return [];
  }
  
  private async readFile(path: string): Promise<string | null> {
    // In real implementation, use kernel's filesystem
    return null;
  }
  
  private detectLanguage(file: string): LanguageId | null {
    const ext = file.split('.').pop()?.toLowerCase();
    for (const [id, lang] of Object.entries(LANGUAGE_REGISTRY)) {
      if (lang.extensions.includes('.' + ext)) {
        return id as LanguageId;
      }
    }
    return null;
  }
  
  private async scanFile(
    file: string, 
    content: string, 
    language: LanguageId, 
    config: ScanConfig
  ): Promise<SASTFinding[]> {
    const findings: SASTFinding[] = [];
    const rules = this.rules.filter(r => 
      (Array.isArray(r.language) ? r.language.includes(language) : r.language === language) &&
      (!config.mode || r.mode === config.mode || config.mode === 'both')
    );
    
    for (const rule of rules) {
      if (rule.mode === 'pattern' && rule.pattern) {
        const matches = await this.runPatternQuery(file, content, language, rule);
        findings.push(...matches);
      } else if (rule.mode === 'taint' && rule.taint) {
        const matches = await this.runTaintAnalysis(file, content, language, rule);
        findings.push(...matches);
      }
    }
    
    return findings;
  }
  
  private async runPatternQuery(
    file: string,
    content: string,
    language: LanguageId,
    rule: SASTRule
  ): Promise<SASTFinding[]> {
    // In real implementation, use tree-sitter to parse and query
    // This is a placeholder showing the pattern
    return [];
  }
  
  private async runTaintAnalysis(
    file: string,
    content: string,
    language: LanguageId,
    rule: SASTRule
  ): Promise<SASTFinding[]> {
    // In real implementation, build CFG, SSA, and run taint analysis
    return [];
  }
  
  private async getParser(language: LanguageId): Promise<any> {
    if (this.parserCache.has(language)) {
      return this.parserCache.get(language);
    }
    
    const langSupport = LANGUAGE_REGISTRY[language];
    const treeSitterLang = await langSupport.treeSitterLanguage();
    
    // In real implementation, create tree-sitter Parser instance
    const parser = null; // new Parser();
    // parser.setLanguage(treeSitterLang);
    
    this.parserCache.set(language, parser);
    return parser;
  }
}

// ============================================================================
// WORKER ENTRY POINT
// ============================================================================

// This would run in a Web Worker
export async function runSASTWorker(data: { config: ScanConfig; rules: SASTRule[] }): Promise<ScanResult> {
  const scanner = new SASTScanner(data.rules);
  return scanner.scan(data.config);
}

