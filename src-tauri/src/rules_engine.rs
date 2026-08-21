//! Rules Engine - Interception rules for MITM proxy

use anyhow::Result;
use glob::Pattern;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Interception rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub match_: InterceptMatch,
    pub action: InterceptAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptMatch {
    pub url_patterns: Option<Vec<String>>,
    pub url_regex: Option<String>,
    pub methods: Option<Vec<String>>,
    pub headers: Option<HashMap<String, String>>,
    pub direction: Option<String>, // "request", "response", "both"
    pub content_types: Option<Vec<String>>,
    pub custom_filter: Option<String>, // JavaScript filter function
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InterceptAction {
    Pass,
    Block,
    Modify { modifications: Vec<Modification> },
    Redirect { redirect_url: String },
    Mock { mock_response: MockResponse },
    Script { script: String },
    Pause,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Modification {
    pub target: String, // "url", "method", "headers", "body", "query"
    pub operation: String, // "set", "add", "remove", "replace", "regex"
    pub path: Option<String>, // JSON path for body
    pub name: Option<String>, // Header name
    pub value: String,
    pub regex: Option<String>,
    pub replacement: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub delay_ms: Option<u64>,
}

/// Rules engine for evaluating interception rules
pub struct RulesEngine {
    rules: Arc<RwLock<Vec<InterceptRule>>>,
    compiled_regexes: Arc<RwLock<HashMap<String, Regex>>>,
}

impl Default for RulesEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl RulesEngine {
    pub fn new() -> Self {
        Self {
            rules: Arc::new(RwLock::new(Vec::new())),
            compiled_regexes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Add a rule
    pub async fn add_rule(&self, rule: InterceptRule) -> Result<()> {
        let mut rules = self.rules.write().await;
        rules.push(rule);
        self.sort_rules(&mut rules);
        self.compile_regexes(&rules).await;
        Ok(())
    }

    /// Update a rule
    pub async fn update_rule(&self, id: &str, rule: InterceptRule) -> Result<()> {
        let mut rules = self.rules.write().await;
        if let Some(index) = rules.iter().position(|r| r.id == id) {
            rules[index] = rule;
            self.sort_rules(&mut rules);
            self.compile_regexes(&rules).await;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Rule not found: {}", id))
        }
    }

    /// Delete a rule
    pub async fn delete_rule(&self, id: &str) -> Result<()> {
        let mut rules = self.rules.write().await;
        rules.retain(|r| r.id != id);
        self.compile_regexes(&rules).await;
        Ok(())
    }

    /// Toggle rule enabled/disabled
    pub async fn toggle_rule(&self, id: &str, enabled: bool) -> Result<()> {
        let mut rules = self.rules.write().await;
        if let Some(rule) = rules.iter_mut().find(|r| r.id == id) {
            rule.enabled = enabled;
            self.sort_rules(&mut rules);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Rule not found: {}", id))
        }
    }

    /// Reorder rules
    pub async fn reorder_rules(&self, ids: Vec<String>) -> Result<()> {
        let mut rules = self.rules.write().await;
        let mut new_rules = Vec::with_capacity(rules.len());
        
        for id in ids {
            if let Some(index) = rules.iter().position(|r| r.id == id) {
                new_rules.push(rules.remove(index));
            }
        }
        
        // Append remaining rules
        new_rules.extend(rules.drain(..));
        *rules = new_rules;
        self.compile_regexes(&rules).await;
        Ok(())
    }

    /// Get all rules
    pub async fn get_rules(&self) -> Vec<InterceptRule> {
        self.rules.read().await.clone()
    }

    /// Get a specific rule
    pub async fn get_rule(&self, id: &str) -> Option<InterceptRule> {
        self.rules.read().await.iter().find(|r| r.id == id).cloned()
    }

    /// Evaluate rules against a request
    pub async fn evaluate_request(&self, request: &HttpRequest) -> Option<InterceptAction> {
        let rules = self.rules.read().await;
        for rule in rules.iter() {
            if !rule.enabled { continue; }
            if matches!(rule.match_.direction, Some(d) if d == "response") { continue; }
            
            if self.matches(&rule.match_, request, None).await {
                return Some(rule.action.clone());
            }
        }
        None
    }

    /// Evaluate rules against a response
    pub async fn evaluate_response(&self, request: &HttpRequest, response: &HttpResponse) -> Option<InterceptAction> {
        let rules = self.rules.read().await;
        for rule in rules.iter() {
            if !rule.enabled { continue; }
            if matches!(rule.match_.direction, Some(d) if d == "request") { continue; }
            
            if self.matches(&rule.match_, request, Some(response)).await {
                return Some(rule.action.clone());
            }
        }
        None
    }

    /// Check if request/response matches rule conditions
    async fn matches(&self, match_: &InterceptMatch, request: &HttpRequest, response: Option<&HttpResponse>) -> bool {
        // URL patterns
        if let Some(patterns) = &match_.url_patterns {
            let matched = patterns.iter().any(|p| Pattern::new(p).map(|pat| pat.matches(&request.url)).unwrap_or(false));
            if !matched { return false; }
        }

        // URL regex
        if let Some(regex_str) = &match_.url_regex {
            let regexes = self.compiled_regexes.read().await;
            if let Some(regex) = regexes.get(regex_str) {
                if !regex.is_match(&request.url) { return false; }
            } else {
                // Compile if not cached
                drop(regexes);
                if let Ok(regex) = Regex::new(regex_str) {
                    if !regex.is_match(&request.url) { return false; }
                    self.compiled_regexes.write().await.insert(regex_str.clone(), regex);
                } else {
                    return false;
                }
            }
        }

        // Methods
        if let Some(methods) = &match_.methods {
            if !methods.contains(&request.method) { return false; }
        }

        // Headers
        if let Some(headers) = &match_.headers {
            for (name, value) in headers {
                if request.headers.get(name) != Some(value) { return false; }
            }
        }

        // Direction
        if let Some(dir) = &match_.direction {
            if dir == "response" && response.is_none() { return false; }
            if dir == "request" && response.is_some() { return false; }
        }

        // Content types
        if let Some(content_types) = &match_.content_types {
            let req_ct = request.headers.get("content-type").unwrap_or("");
            let resp_ct = response.and_then(|r| r.headers.get("content-type")).unwrap_or("");
            let ct = if response.is_some() { resp_ct } else { req_ct };
            let matched = content_types.iter().any(|ct| ct.contains(ct));
            if !matched { return false; }
        }

        // Custom filter (JavaScript) - would need JS runtime
        if match_.custom_filter.is_some() {
            // TODO: Implement JS filter evaluation
        }

        true
    }

    /// Sort rules by priority (highest first)
    fn sort_rules(&self, rules: &mut Vec<InterceptRule>) {
        rules.sort_by(|a, b| b.priority.cmp(&a.priority));
    }

    /// Compile regexes for all rules
    async fn compile_regexes(&self, rules: &[InterceptRule]) {
        let mut compiled = HashMap::new();
        for rule in rules {
            if let Some(regex_str) = &rule.match_.url_regex {
                if compiled.get(regex_str).is_none() {
                    if let Ok(regex) = Regex::new(regex_str) {
                        compiled.insert(regex_str.clone(), regex);
                    }
                }
            }
        }
        *self.compiled_regexes.write().await = compiled;
    }
}

/// HTTP Request for rule matching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequest {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub url: String,
    pub http_version: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub remote_addr: String,
}

impl HttpRequest {
    pub fn new(id: String, method: String, url: String, headers: HashMap<String, String>, body: Option<String>, remote_addr: String) -> Self {
        Self {
            id,
            timestamp: chrono::Utc::now().timestamp_millis(),
            method,
            url,
            http_version: "HTTP/1.1".to_string(),
            headers,
            body,
            remote_addr,
        }
    }
}

/// HTTP Response for rule matching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub request_id: String,
    pub timestamp: i64,
    pub status_code: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub timing: TimingInfo,
}

impl HttpResponse {
    pub fn new(request_id: String, status_code: u16, status_text: String, headers: HashMap<String, String>, body: Option<String>, timing: TimingInfo) -> Self {
        Self {
            request_id,
            timestamp: chrono::Utc::now().timestamp_millis(),
            status_code,
            status_text,
            http_version: "HTTP/1.1".to_string(),
            headers,
            body,
            timing,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimingInfo {
    pub dns_lookup: Option<u64>,
    pub tcp_connect: Option<u64>,
    pub tls_handshake: Option<u64>,
    pub request_sent: Option<u64>,
    pub waiting: Option<u64>,
    pub content_download: Option<u64>,
    pub total: Option<u64>,
}