"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Card,
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Toggle,
  ConfirmModal,
} from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  
  // Inline rename states
  const [editingKeyId, setEditingKeyId] = useState(null);
  const [editingKeyName, setEditingKeyName] = useState("");

  // Reveal key states
  const [revealedKeys, setRevealedKeys] = useState({}); // keyId -> timerId

  // Permissions editor states
  const [showPermsModal, setShowPermsModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [permsForm, setPermsForm] = useState({
    mode: "allow_all",
    allowedPrefixes: [],
    allowedModels: [],
    deniedModels: [],
    allowedCombos: [],
  });
  const [originalPerms, setOriginalPerms] = useState(null); // to detect unsaved changes
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Copy permissions selector
  const [copySourceKeyId, setCopySourceKeyId] = useState("");

  // Editor Tabs: "general", "providers", "models", "combos", "test"
  const [activeTab, setActiveTab] = useState("general");

  // Metadata/Catalogs
  const [providersList, setProvidersList] = useState([]);
  const [combosList, setCombosList] = useState([]);

  // Test access playground state
  const [testModelInput, setTestModelInput] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  // Onboarding banner state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Confirm generic state
  const [confirmState, setConfirmState] = useState(null);

  const notify = useNotificationStore();
  const { copied, copy } = useCopyToClipboard(2000);

  // Load basic data
  useEffect(() => {
    fetchKeys();
    fetchCatalogs();
    
    // Onboarding banner check
    const dismissed = localStorage.getItem("9router_keys_onboarding_dismissed");
    if (!dismissed) {
      setShowOnboarding(true);
    }
  }, []);

  // Cleanup reveal timers on unmount
  useEffect(() => {
    return () => {
      Object.values(revealedKeys).forEach(timerId => clearTimeout(timerId));
    };
  }, [revealedKeys]);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/keys");
      const data = await res.json();
      if (res.ok) {
        setKeys(data.keys || []);
      } else {
        notify.error("Failed to load API keys");
      }
    } catch (err) {
      notify.error("Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogs = async () => {
    try {
      const [provsRes, combosRes] = await Promise.all([
        fetch("/api/providers/list-with-models"),
        fetch("/api/combos/names"),
      ]);
      if (provsRes.ok) {
        const provsData = await provsRes.json();
        setProvidersList(provsData.providers || []);
      }
      if (combosRes.ok) {
        const combosData = await combosRes.json();
        setCombosList(combosData.combos || []);
      }
    } catch (err) {
      console.error("Error loading models/combos catalogs:", err);
    }
  };

  const handleDismissOnboarding = () => {
    localStorage.setItem("9router_keys_onboarding_dismissed", "true");
    setShowOnboarding(false);
  };

  // Create new key
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedKey(data.key);
        fetchKeys();
        setNewKeyName("");
        setShowAddModal(false);
        notify.success(`API key "${data.name}" created successfully`);
      } else {
        notify.error(data.error || "Failed to create key");
      }
    } catch (err) {
      notify.error("Connection error while creating key");
    }
  };

  // Delete key
  const handleDeleteKey = (key) => {
    setConfirmState({
      title: "Delete API Key",
      message: `Are you sure you want to delete the key "${key.name}"? This action cannot be undone, and clients using this key will immediately receive errors.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${key.id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== key.id));
            notify.success(`API key "${key.name}" deleted`);
          } else {
            notify.error("Failed to delete key");
          }
        } catch (err) {
          notify.error("Connection error");
        }
      },
    });
  };

  // Toggle active status
  const handleToggleKey = async (key, checked) => {
    try {
      const res = await fetch(`/api/keys/${key.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: checked }),
      });
      if (res.ok) {
        setKeys(keys.map(k => k.id === key.id ? { ...k, isActive: checked } : k));
        notify.success(`API key "${key.name}" ${checked ? "resumed" : "paused"}`);
      } else {
        notify.error("Failed to update status");
      }
    } catch (err) {
      notify.error("Connection error");
    }
  };

  // Rename inline
  const startRename = (key) => {
    setEditingKeyId(key.id);
    setEditingKeyName(key.name);
  };

  const saveRename = async (key) => {
    if (!editingKeyName.trim() || editingKeyName.trim() === key.name) {
      setEditingKeyId(null);
      return;
    }
    try {
      const res = await fetch(`/api/keys/${key.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingKeyName.trim() }),
      });
      if (res.ok) {
        setKeys(keys.map(k => k.id === key.id ? { ...k, name: editingKeyName.trim() } : k));
        notify.success("Key renamed successfully");
      } else {
        notify.error("Failed to rename key");
      }
    } catch (err) {
      notify.error("Connection error");
    } finally {
      setEditingKeyId(null);
    }
  };

  // Reveal key for 10 seconds
  const handleRevealKey = (keyId) => {
    // If already revealed, do nothing
    if (revealedKeys[keyId]) return;

    // Set auto-hide timer after 10 seconds
    const timerId = setTimeout(() => {
      setRevealedKeys(prev => {
        const next = { ...prev };
        delete next[keyId];
        return next;
      });
    }, 10000);

    setRevealedKeys(prev => ({
      ...prev,
      [keyId]: timerId
    }));
  };

  const maskKey = (fullKey) => {
    if (!fullKey) return "";
    return fullKey.slice(0, 8) + "•".repeat(24) + fullKey.slice(-4);
  };

  // Open permissions editor
  const handleOpenPermissions = (key) => {
    setSelectedKey(key);
    const initial = key.permissions || {
      mode: "allow_all",
      allowedPrefixes: [],
      allowedModels: [],
      deniedModels: [],
      allowedCombos: [],
    };
    
    // Deep clone to track changes
    const cloned = JSON.parse(JSON.stringify(initial));
    
    setPermsForm(cloned);
    setOriginalPerms(JSON.stringify(cloned));
    setCopySourceKeyId("");
    setActiveTab("general");
    setTestModelInput("");
    setTestResult(null);
    setShowPermsModal(true);
  };

  // Check if permissions form was edited
  const isFormDirty = useMemo(() => {
    if (!originalPerms) return false;
    return JSON.stringify(permsForm) !== originalPerms;
  }, [permsForm, originalPerms]);

  // Handle closing permissions modal with unsaved alert
  const handleClosePerms = () => {
    if (isFormDirty) {
      setShowCancelConfirm(true);
    } else {
      setShowPermsModal(false);
      setSelectedKey(null);
    }
  };

  // Copy permissions from another key
  const handleCopyPermissions = (sourceKeyId) => {
    if (!sourceKeyId) return;
    const sourceKey = keys.find(k => k.id === sourceKeyId);
    if (sourceKey) {
      const sourcePerms = sourceKey.permissions || {
        mode: "allow_all",
        allowedPrefixes: [],
        allowedModels: [],
        deniedModels: [],
        allowedCombos: [],
      };
      
      setPermsForm(JSON.parse(JSON.stringify(sourcePerms)));
      notify.info(`Copied permissions structure from "${sourceKey.name}"`);
    }
    setCopySourceKeyId("");
  };

  // Save permissions
  const handleSavePermissions = async () => {
    if (!selectedKey) return;
    try {
      const res = await fetch(`/api/keys/${selectedKey.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permsForm }),
      });
      if (res.ok) {
        // Update local state
        setKeys(keys.map(k => k.id === selectedKey.id ? { ...k, permissions: permsForm } : k));
        setShowPermsModal(false);
        setSelectedKey(null);
        notify.success(`Access permissions updated for "${selectedKey.name}"`);
      } else {
        notify.error("Failed to save permissions");
      }
    } catch (err) {
      notify.error("Connection error while saving permissions");
    }
  };

  // Test access playground handler
  const handleTestAccess = async () => {
    if (!testModelInput.trim() || !selectedKey) return;
    try {
      setTestLoading(true);
      setTestResult(null);
      // Wait, we test local unsaved changes or saved changes? The API fetches saved permissions from SQLite.
      // So if the form is dirty, warn the user they are testing the *saved* key state, or we could save first.
      // Let's call the test API which checks keyInfo in DB.
      const modelParam = encodeURIComponent(testModelInput.trim());
      const res = await fetch(`/api/keys/${selectedKey.id}/test?model=${modelParam}`);
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          allowed: data.allowed,
          reason: data.reason,
          code: data.code,
          model: data.model,
          kind: data.kind,
        });
      } else {
        notify.error(data.error || "Testing failed");
      }
    } catch (err) {
      notify.error("Connection error during testing");
    } finally {
      setTestLoading(false);
    }
  };

  // Helper getters for summary stats
  const getPermissionsSummary = (key) => {
    const perms = key.permissions;
    if (!perms || perms.mode === "allow_all") {
      return "Unlimited (Allow All)";
    }
    
    const parts = [];
    const prefixes = perms.allowedPrefixes || [];
    const models = perms.allowedModels || [];
    const denied = perms.deniedModels || [];
    const combos = perms.allowedCombos || [];
    
    if (prefixes.length > 0) parts.push(`${prefixes.length} Provider${prefixes.length > 1 ? "s" : ""}`);
    if (models.length > 0) parts.push(`${models.length} Model${models.length > 1 ? "s" : ""}`);
    if (combos.length > 0) parts.push(`${combos.length} Combo${combos.length > 1 ? "s" : ""}`);
    if (denied.length > 0) parts.push(`${denied.length} Denied override${denied.length > 1 ? "s" : ""}`);
    
    if (parts.length === 0) return "Restricted (No access)";
    return parts.join(", ");
  };

  // Multiselect toggles
  const togglePrefix = (prefix) => {
    setPermsForm(prev => {
      const prefixes = prev.allowedPrefixes || [];
      const index = prefixes.indexOf(prefix);
      const next = [...prefixes];
      if (index > -1) {
        next.splice(index, 1);
      } else {
        next.push(prefix);
      }
      return { ...prev, allowedPrefixes: next };
    });
  };

  const toggleModel = (modelId) => {
    setPermsForm(prev => {
      const models = prev.allowedModels || [];
      const index = models.indexOf(modelId);
      const next = [...models];
      if (index > -1) {
        next.splice(index, 1);
      } else {
        next.push(modelId);
      }
      return { ...prev, allowedModels: next };
    });
  };

  const toggleCombo = (comboName) => {
    setPermsForm(prev => {
      const combos = prev.allowedCombos || [];
      const index = combos.indexOf(comboName);
      const next = [...combos];
      if (index > -1) {
        next.splice(index, 1);
      } else {
        next.push(comboName);
      }
      return { ...prev, allowedCombos: next };
    });
  };

  const handleAddDeniedModel = (modelPattern) => {
    if (!modelPattern.trim()) return;
    const cleanPattern = modelPattern.trim();
    setPermsForm(prev => {
      const denied = prev.deniedModels || [];
      if (denied.includes(cleanPattern)) return prev;
      return { ...prev, deniedModels: [...denied, cleanPattern] };
    });
  };

  const handleRemoveDeniedModel = (pattern) => {
    setPermsForm(prev => {
      const denied = prev.deniedModels || [];
      return { ...prev, deniedModels: denied.filter(p => p !== pattern) };
    });
  };

  // Grouped collapsible models view variables
  const [modelSearch, setModelSearch] = useState("");
  const [collapsedProviders, setCollapsedProviders] = useState({});

  const toggleProviderCollapse = (providerId) => {
    setCollapsedProviders(prev => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  // Filtered providers and models based on search query with deduplication
  const filteredProviders = useMemo(() => {
    const query = modelSearch.toLowerCase().trim();
    return providersList.map(prov => {
      // Deduplicate original models list to prevent duplicate keys in UI
      const uniqueModels = Array.from(new Set(prov.models || []));
      if (!query) {
        return {
          ...prov,
          models: uniqueModels
        };
      }
      const matchingModels = uniqueModels.filter(m => 
        m.toLowerCase().includes(query) || 
        prov.name.toLowerCase().includes(query) || 
        prov.alias.toLowerCase().includes(query)
      );
      if (matchingModels.length > 0 || prov.name.toLowerCase().includes(query)) {
        return {
          ...prov,
          models: matchingModels
        };
      }
      return null;
    }).filter(Boolean);
  }, [providersList, modelSearch]);

  return (
    <div className="flex flex-col gap-6">
      {/* Onboarding Banner */}
      {showOnboarding && (
        <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-r from-brand-500/10 via-brand-600/5 to-transparent border border-brand-500/20 p-5 shadow-[var(--shadow-soft)] animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="size-10 rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">security</span>
            </div>
            <div className="flex-1 min-w-0 pr-8">
              <h4 className="font-semibold text-text-main text-sm sm:text-base mb-1">
                New Feature: Per-API-Key Access Control
              </h4>
              <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
                Restrict model routing and API access on a key-by-key basis. Existing API keys preserve the
                default **allow-all** behavior. Click on the action button of any key to customize access and restrict specific providers, models, or combos.
              </p>
            </div>
            <button
              onClick={handleDismissOnboarding}
              className="absolute top-4 right-4 p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors cursor-pointer"
              aria-label="Dismiss banner"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Keys List Card */}
      <Card
        title="API Keys Management"
        subtitle="Manage access credentials and customize fine-grained model routing restrictions."
        icon="key"
        action={
          <Button icon="add" onClick={() => setShowAddModal(true)}>
            Create Key
          </Button>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-3 py-6">
            <div className="h-8 bg-surface-2 animate-pulse rounded-lg w-full" />
            <div className="h-12 bg-surface-2 animate-pulse rounded-lg w-full" />
            <div className="h-12 bg-surface-2 animate-pulse rounded-lg w-full" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-500/10 text-brand-500 mb-4 animate-pulse">
              <span className="material-symbols-outlined text-[32px]">vpn_key</span>
            </div>
            <p className="text-text-main font-semibold mb-1">No API keys created yet</p>
            <p className="text-sm text-text-muted mb-6">Create an API key to allow external integrations to access your 9Router.</p>
            <Button icon="add" onClick={() => setShowAddModal(true)}>
              Create First Key
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin-x -mx-6 px-6">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted font-medium">
                  <th className="py-3 px-4 w-[25%]">Name</th>
                  <th className="py-3 px-4 w-[35%]">Key Token</th>
                  <th className="py-3 px-4 w-[15%]">Permissions Mode</th>
                  <th className="py-3 px-4 w-[15%]">Status</th>
                  <th className="py-3 px-4 text-right w-[10%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {keys.map((key) => {
                  const isRevealed = !!revealedKeys[key.id];
                  const isAllowAll = !key.permissions || key.permissions.mode === "allow_all";
                  
                  return (
                    <tr
                      key={key.id}
                      className={`hover:bg-surface-2/20 transition-colors ${
                        !key.isActive ? "opacity-60" : ""
                      }`}
                    >
                      {/* Name Column */}
                      <td className="py-4 px-4 font-medium text-text-main align-middle">
                        {editingKeyId === key.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingKeyName}
                              onChange={(e) => setEditingKeyName(e.target.value)}
                              className="px-2.5 py-1 text-sm bg-surface-3 border border-brand-500/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-text-main w-full"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(key);
                                if (e.key === "Escape") setEditingKeyId(null);
                              }}
                            />
                            <button
                              onClick={() => saveRename(key)}
                              className="p-1 rounded bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400"
                              title="Save name"
                            >
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            </button>
                            <button
                              onClick={() => setEditingKeyId(null)}
                              className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500"
                              title="Cancel"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span className="truncate max-w-[180px]">{key.name}</span>
                            <button
                              onClick={() => startRename(key)}
                              className="p-1 rounded text-text-muted hover:text-brand-500 opacity-0 group-hover/name:opacity-100 transition-opacity"
                              title="Rename API key"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                          </div>
                        )}
                        <div className="text-[10px] text-text-subtle mt-0.5 font-normal">
                          Created {new Date(key.createdAt).toLocaleString()}
                        </div>
                      </td>

                      {/* Key Token Column */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded bg-surface-2 font-mono text-xs text-text-main tracking-tight select-all">
                            {isRevealed ? key.key : maskKey(key.key)}
                          </code>
                          <button
                            onClick={() => handleRevealKey(key.id)}
                            disabled={isRevealed}
                            className={`p-1 rounded text-text-muted hover:text-brand-500 transition-colors ${
                              isRevealed ? "opacity-30 cursor-default" : "cursor-pointer"
                            }`}
                            title={isRevealed ? "Key visible for 10 seconds" : "Reveal API Key (10s)"}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {isRevealed ? "visibility" : "visibility_off"}
                            </span>
                          </button>
                          <button
                            onClick={() => copy(key.key, `copy_${key.id}`)}
                            className="p-1 rounded text-text-muted hover:text-brand-500 transition-colors cursor-pointer"
                            title="Copy to clipboard"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {copied === `copy_${key.id}` ? "check" : "content_copy"}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Mode Column */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <div>
                            <Badge variant={isAllowAll ? "success" : "warning"} size="sm" dot>
                              {isAllowAll ? "Allow All" : "Restricted"}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-text-muted truncate max-w-[170px]" title={getPermissionsSummary(key)}>
                            {getPermissionsSummary(key)}
                          </span>
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <Toggle
                            size="sm"
                            checked={key.isActive ?? true}
                            onChange={(checked) => {
                              if (key.isActive && !checked) {
                                setConfirmState({
                                  title: "Pause API Key",
                                  message: `Pause API key "${key.name}"? Clients using this key will immediately get blocked until you resume the key.`,
                                  onConfirm: () => {
                                    setConfirmState(null);
                                    handleToggleKey(key, checked);
                                  },
                                });
                              } else {
                                handleToggleKey(key, checked);
                              }
                            }}
                          />
                          <span className={`text-xs font-semibold ${key.isActive ? "text-green-500" : "text-amber-500"}`}>
                            {key.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-4 px-4 text-right align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenPermissions(key)}
                            className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-brand-500 transition-colors"
                            title="Edit Permissions & Test"
                          >
                            <span className="material-symbols-outlined text-[18px]">settings</span>
                          </button>
                          <button
                            onClick={() => handleDeleteKey(key)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                            title="Delete API key"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create New API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="API Key Label/Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Cursor Development, Production Agent"
            required
            autoFocus
          />
          <div className="flex gap-3 justify-end mt-2">
            <Button
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={!newKeyName.trim()}>
              Create Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reveal Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created Successfully"
        onClose={() => setCreatedKey(null)}
        closeOnOverlay={false}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              Save this key now!
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              For security, this key token is only shown once. You will not be able to retrieve it again if you close this window.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
              onClick={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-2">
            <Button onClick={() => setCreatedKey(null)} fullWidth>
              Done, I have saved it
            </Button>
          </div>
        </div>
      </Modal>

      {/* Permissions Editor Modal */}
      {selectedKey && (
        <Modal
          isOpen={showPermsModal}
          title={`Edit Permissions: ${selectedKey.name}`}
          size="lg"
          onClose={handleClosePerms}
          className="max-w-2xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-text-muted">
                {isFormDirty ? (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    Unsaved changes
                  </span>
                ) : (
                  <span className="text-green-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Saved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleClosePerms}>
                  Close
                </Button>
                <Button variant="primary" onClick={handleSavePermissions} disabled={!isFormDirty}>
                  Save Permissions
                </Button>
              </div>
            </div>
          }
        >
          {/* Modal Content - Tabs & Config */}
          <div className="flex flex-col gap-4">
            
            {/* On-the-fly Replication (Copy from Key) */}
            <div className="flex flex-col sm:flex-row items-end gap-3 pb-3 border-b border-border-subtle">
              <div className="flex-1">
                <label className="text-xs font-semibold text-text-muted mb-1 block">
                  Replicate from another key
                </label>
                <Select
                  value={copySourceKeyId}
                  onChange={(e) => {
                    setCopySourceKeyId(e.target.value);
                    handleCopyPermissions(e.target.value);
                  }}
                  placeholder="Select key to copy permissions..."
                  options={keys
                    .filter(k => k.id !== selectedKey.id)
                    .map(k => ({ value: k.id, label: k.name }))}
                />
              </div>
            </div>

            {/* Editor Tabs Navigation */}
            <div className="flex border-b border-border-subtle overflow-x-auto scroll-thin-x -mx-6 px-6">
              {[
                { id: "general", label: "General", icon: "settings" },
                { id: "providers", label: "Providers / Prefixes", icon: "dns" },
                { id: "models", label: "Models Allowlist", icon: "widgets" },
                { id: "combos", label: "Combos", icon: "layers" },
                { id: "test", label: "Test Playground", icon: "play_circle" },
              ].map(tab => {
                const isActive = activeTab === tab.id;
                // Don't disable but show visual block in restricted
                const isRestrictedTab = ["providers", "models", "combos"].includes(tab.id);
                const disabled = isRestrictedTab && permsForm.mode === "allow_all";
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => !disabled && setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors ${
                      isActive
                        ? "border-brand-500 text-brand-500 font-semibold"
                        : disabled
                          ? "border-transparent text-text-subtle/50 cursor-not-allowed"
                          : "border-transparent text-text-muted hover:text-text-main"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Panels */}
            <div className="py-2 min-h-[300px] max-h-[45vh] overflow-y-auto custom-scrollbar px-1">
              
              {/* TAB 1: General */}
              {activeTab === "general" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-main">Access Control Mode</label>
                    <p className="text-xs text-text-muted mb-2">
                      Choose if this key allows routing requests to all active models or is restricted to a curated allowlist.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: "allow_all",
                          title: "Allow All Models (Default)",
                          desc: "No restrictions. Backward-compatible. Can call any active models or combos.",
                          icon: "lock_open",
                        },
                        {
                          id: "restricted",
                          title: "Restricted Access",
                          desc: "Enforce strict policies. Key can only access selected providers, models, or combos.",
                          icon: "security",
                        },
                      ].map((mode) => {
                        const active = permsForm.mode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setPermsForm(prev => ({ ...prev, mode: mode.id }))}
                            className={`text-left rounded-xl border p-4 transition-all flex flex-col gap-1 cursor-pointer ${
                              active
                                ? "border-brand-500 bg-brand-500/5 shadow-sm"
                                : "border-border-subtle bg-bg hover:bg-surface-2"
                            }`}
                          >
                            <span className={`material-symbols-outlined text-[20px] mb-1 ${active ? "text-brand-500" : "text-text-muted"}`}>
                              {mode.icon}
                            </span>
                            <span className="font-semibold text-sm text-text-main">{mode.title}</span>
                            <span className="text-xs text-text-muted leading-relaxed">{mode.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {permsForm.mode === "restricted" && (
                    <div className="bg-brand-500/5 border border-brand-500/10 rounded-xl p-4 mt-2">
                      <p className="text-xs text-brand-600 dark:text-brand-300 font-semibold mb-1">
                        Restricted Mode Configuration
                      </p>
                      <p className="text-xs text-text-muted leading-relaxed">
                        Proceed to the other tabs (**Providers**, **Models**, **Combos**) to customize access rules.
                        If restricted mode is active but lists are empty, this key will have **no** access to any models.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Providers */}
              {activeTab === "providers" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-text-muted">
                    Allowing a provider grants this key access to **all** active models under its prefix wildcard (e.g. `kr/*` for Kiro).
                  </p>
                  
                  {providersList.length === 0 ? (
                    <p className="text-sm text-text-muted italic">No providers available.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {providersList.map((prov) => {
                        const isAllowed = (permsForm.allowedPrefixes || []).includes(prov.alias);
                        return (
                          <div
                            key={prov.id}
                            onClick={() => togglePrefix(prov.alias)}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-surface-2 transition-all ${
                              isAllowed
                                ? "border-brand-500 bg-brand-500/5"
                                : "border-border-subtle"
                            }`}
                          >
                            <div className={`size-5 rounded flex items-center justify-center shrink-0 border ${
                              isAllowed ? "bg-brand-500 border-brand-500 text-white" : "border-border text-transparent"
                            }`}>
                              <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-main truncate">{prov.name}</p>
                              <code className="text-[10px] text-text-muted font-mono">{prov.alias}/*</code>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Models */}
              {activeTab === "models" && (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search active models catalog..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      icon="search"
                      className="flex-1"
                    />
                    {modelSearch && (
                      <Button variant="ghost" onClick={() => setModelSearch("")} size="sm">
                        Clear
                      </Button>
                    )}
                  </div>

                  {/* List of Models Grouped by Provider */}
                  <div className="flex flex-col gap-3">
                    {filteredProviders.length === 0 ? (
                      <p className="text-sm text-text-muted italic py-4">No models match your search.</p>
                    ) : (
                      filteredProviders.map((prov) => {
                        const isCollapsed = !!collapsedProviders[prov.id];
                        const isPrefixAllowed = (permsForm.allowedPrefixes || []).includes(prov.alias);
                        
                        // Count checked models
                        const allowedModelsCount = prov.models.filter(m => 
                          (permsForm.allowedModels || []).includes(`${prov.alias}/${m}`)
                        ).length;

                        return (
                          <div key={prov.id} className="border border-border-subtle rounded-xl overflow-hidden bg-surface-2/20">
                            {/* Group Header */}
                            <div 
                              onClick={() => toggleProviderCollapse(prov.id)}
                              className="flex items-center justify-between px-4 py-3 bg-surface-3/30 hover:bg-surface-3/60 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-text-muted">
                                  {isCollapsed ? "chevron_right" : "expand_more"}
                                </span>
                                <span className="font-semibold text-sm text-text-main">{prov.name}</span>
                                <Badge size="sm">
                                  {prov.alias}
                                </Badge>
                                {isPrefixAllowed && (
                                  <Badge variant="success" size="sm">
                                    All Allowed
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-text-muted">
                                  {isPrefixAllowed ? "Wildcard allowed" : `${allowedModelsCount} of ${prov.models.length} selected`}
                                </span>
                                
                                {/* Quick select/deselect buttons */}
                                {!isPrefixAllowed && (
                                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => {
                                        // Select all models under this prefix
                                        const otherModels = (permsForm.allowedModels || []).filter(m => !m.startsWith(`${prov.alias}/`));
                                        const newAllowed = [...otherModels, ...prov.models.map(m => `${prov.alias}/${m}`)];
                                        setPermsForm(prev => ({ ...prev, allowedModels: newAllowed }));
                                      }}
                                      className="text-[10px] text-brand-500 hover:underline cursor-pointer"
                                    >
                                      Select All
                                    </button>
                                    <span className="text-[10px] text-text-subtle">|</span>
                                    <button
                                      onClick={() => {
                                        // Deselect all models under this prefix
                                        const otherModels = (permsForm.allowedModels || []).filter(m => !m.startsWith(`${prov.alias}/`));
                                        setPermsForm(prev => ({ ...prev, allowedModels: otherModels }));
                                      }}
                                      className="text-[10px] text-brand-500 hover:underline cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Group Body */}
                            {!isCollapsed && (
                              <div className="p-3 border-t border-border-subtle/40 bg-surface divide-y divide-border-subtle/30">
                                {prov.models.map((modelId) => {
                                  const fullModel = `${prov.alias}/${modelId}`;
                                  const isAllowed = isPrefixAllowed || (permsForm.allowedModels || []).includes(fullModel);
                                  
                                  return (
                                    <div 
                                      key={fullModel}
                                      onClick={() => !isPrefixAllowed && toggleModel(fullModel)}
                                      className={`flex items-center justify-between py-2 px-1 ${
                                        isPrefixAllowed ? "opacity-60 cursor-default" : "cursor-pointer hover:bg-surface-2/30 rounded"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`size-4 rounded flex items-center justify-center shrink-0 border ${
                                          isAllowed ? "bg-brand-500 border-brand-500 text-white" : "border-border text-transparent"
                                        }`}>
                                          <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                                        </div>
                                        <span className="text-xs font-mono text-text-main truncate" title={modelId}>
                                          {modelId}
                                        </span>
                                      </div>
                                      
                                      {isPrefixAllowed ? (
                                        <span className="text-[10px] text-green-500 italic">Allowed via Provider Wildcard</span>
                                      ) : isAllowed ? (
                                        <span className="text-[10px] text-brand-500 font-semibold">Allowed</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Denied Models (Overrides) Section */}
                  <div className="pt-4 border-t border-border-subtle mt-2">
                    <h5 className="font-semibold text-sm text-text-main mb-1">
                      Denied Models (Explicit Overrides)
                    </h5>
                    <p className="text-xs text-text-muted mb-3">
                      Denied models always win over allowed list. Support exact model IDs (`kr/gemini-pro`) or wildcards (`kr/claude-*`).
                    </p>
                    
                    {/* Add Pattern Form */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        placeholder="e.g. kr/claude-experimental, oai/gpt-4-32k"
                        id="denied-model-input"
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddDeniedModel(e.target.value);
                            e.target.value = "";
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const input = document.getElementById("denied-model-input");
                          if (input) {
                            handleAddDeniedModel(input.value);
                            input.value = "";
                          }
                        }}
                      >
                        Add Deny Rule
                      </Button>
                    </div>

                    {/* Active Denied Rules List */}
                    {(permsForm.deniedModels || []).length === 0 ? (
                      <p className="text-xs text-text-muted italic py-1">No explicit deny rules added.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(permsForm.deniedModels || []).map((pattern) => (
                          <span
                            key={pattern}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-mono text-xs"
                          >
                            {pattern}
                            <button
                              onClick={() => handleRemoveDeniedModel(pattern)}
                              className="hover:text-red-800 transition-colors p-0.5"
                              title="Remove deny rule"
                            >
                              <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: Combos */}
              {activeTab === "combos" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-text-muted">
                    Grant this key access to load and route queries through specific combos.
                  </p>
                  
                  {combosList.length === 0 ? (
                    <p className="text-sm text-text-muted italic">No combos configured in 9Router.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {combosList.map((comboName) => {
                        const isAllowed = (permsForm.allowedCombos || []).includes(comboName);
                        return (
                          <div
                            key={comboName}
                            onClick={() => toggleCombo(comboName)}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-surface-2 transition-all ${
                              isAllowed
                                ? "border-brand-500 bg-brand-500/5"
                                : "border-border-subtle"
                            }`}
                          >
                            <div className={`size-5 rounded flex items-center justify-center shrink-0 border ${
                              isAllowed ? "bg-brand-500 border-brand-500 text-white" : "border-border text-transparent"
                            }`}>
                              <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                            </div>
                            <span className="text-sm font-semibold text-text-main truncate" title={comboName}>
                              {comboName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: Test Playground */}
              {activeTab === "test" && (
                <div className="flex flex-col gap-4">
                  <div className="bg-surface-3/30 border border-border-subtle rounded-xl p-4">
                    <h5 className="font-semibold text-sm text-text-main mb-1">
                      Simulate Model Routing Access
                    </h5>
                    <p className="text-xs text-text-muted mb-3 leading-relaxed">
                      Instantly test whether a model/combo identifier is allowed for this key based on the saved rules in database.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. kr/gemini-pro or combo-name"
                        value={testModelInput}
                        onChange={(e) => setTestModelInput(e.target.value)}
                        className="flex-1 font-mono text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleTestAccess();
                        }}
                      />
                      <Button
                        onClick={handleTestAccess}
                        disabled={!testModelInput.trim() || testLoading}
                        loading={testLoading}
                      >
                        Test
                      </Button>
                    </div>
                  </div>

                  {/* Test Results Output */}
                  {testResult && (
                    <div className={`rounded-xl border p-4 animate-fade-in ${
                      testResult.allowed
                        ? "bg-green-500/5 border-green-500/20 text-green-600 dark:text-green-400"
                        : "bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400"
                    }`}>
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[24px]">
                          {testResult.allowed ? "check_circle" : "cancel"}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">
                            {testResult.allowed ? "Access Granted" : "Access Blocked / Denied"}
                          </p>
                          <p className="text-xs text-text-muted mt-1 leading-relaxed">
                            {testResult.allowed
                              ? `Key is authorized to route requests to "${testResult.model}" (${testResult.kind}).`
                              : testResult.reason || "This identifier is not allowed under the current restricted ruleset."}
                          </p>
                          {testResult.code && (
                            <code className="inline-block mt-2 px-1.5 py-0.5 rounded bg-surface-2 text-[10px] font-mono border border-border text-text-main">
                              code: {testResult.code}
                            </code>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>
        </Modal>
      )}

      {/* Generic confirmation modal */}
      {confirmState && (
        <ConfirmModal
          isOpen={!!confirmState}
          onClose={() => setConfirmState(null)}
          onConfirm={confirmState.onConfirm}
          title={confirmState.title}
          message={confirmState.message}
        />
      )}

      {/* Permissions Unsaved Changes Modal */}
      {showCancelConfirm && (
        <ConfirmModal
          isOpen={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            setShowCancelConfirm(false);
            setShowPermsModal(false);
            setSelectedKey(null);
          }}
          title="Unsaved Changes"
          message="You have unsaved changes in the permissions editor. Are you sure you want to discard them?"
          confirmText="Discard Changes"
          cancelText="Keep Editing"
          variant="warning"
        />
      )}

    </div>
  );
}
