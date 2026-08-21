//! Proxy module — the real engine is `mitm_proxy` (hudsucker).
//!
//! This module exists only to keep the `crate::proxy::…` paths used by
//! commands/state pointing at the single source of truth. The legacy
//! hand-rolled ProxyService was removed: it duplicated the hudsucker
//! engine with placeholder loops and dead hyper-1.x imports.

pub use crate::mitm_proxy::{
    MITMProxyEngine as ProxyService,
    ProxyConfig as ProxyEngineConfig,
    ProxyStatus,
};

// Re-export HTTP models so rules_engine consumers have one import path.
pub use crate::rules_engine::{HttpRequest, HttpResponse};
