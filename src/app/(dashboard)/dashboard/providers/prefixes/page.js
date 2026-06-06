"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  Badge,
  Button,
  Input,
  Modal,
  Select,
} from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  AI_PROVIDERS,
  getProviderAlias,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isCustomEmbeddingProvider,
} from "@/shared/constants/providers";

export default function PrefixManagerPage() {
  const [connections, setConnections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "standard" | "custom"

  // Inline edit state
  // key can be: connection_[id] or node_[id]
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState(null);

  // Batch edit states
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProvider, setBatchProvider] = useState("");
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);

  const notify = useNotificationStore();

  const uniqueProvidersList = useMemo(() => {
    const providers = new Set(connections.map(c => c.provider));
    return Array.from(providers).map(pId => {
      const pInfo = AI_PROVIDERS[pId] || {};
      return {
        id: pId,
        name: pInfo.name || pId,
      };
    });
  }, [connections]);

  const handleSaveBatchPrefix = async () => {
    if (!batchProvider) return;
    const cleanPrefix = batchPrefix.trim();
    const error = validatePrefix(cleanPrefix, false);
    if (error) {
      notify.error(error);
      return;
    }

    setBatchSaving(true);
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch-prefix",
          provider: batchProvider,
          prefix: cleanPrefix,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state
        setConnections(prev =>
          prev.map(c => {
            if (c.provider === batchProvider) {
              const updatedPSD = { ...(c.providerSpecificData || {}) };
              if (cleanPrefix) {
                updatedPSD.prefix = cleanPrefix;
              } else {
                delete updatedPSD.prefix;
              }
              return { ...c, providerSpecificData: updatedPSD };
            }
            return c;
          })
        );
        notify.success(`Successfully updated prefix for ${data.count} connections`);
        setShowBatchModal(false);
        setBatchProvider("");
        setBatchPrefix("");
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to batch update prefixes");
      }
    } catch (err) {
      notify.error("Connection error while performing batch update");
    } finally {
      setBatchSaving(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [connectionsRes, nodesRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/provider-nodes"),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();

      if (connectionsRes.ok) {
        setConnections(connectionsData.connections || []);
      }
      if (nodesRes.ok) {
        setNodes(nodesData.nodes || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      notify.error("Failed to load connections and provider nodes");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (id, currentValue) => {
    setEditingId(id);
    setEditValue(currentValue || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const validatePrefix = (val, isNode = false) => {
    const clean = val.trim();
    if (!clean) {
      // Nodes require prefix, standard connections can have empty (defaults)
      return isNode ? "Prefix is required for custom provider nodes" : null;
    }
    if (clean.length > 32) {
      return "Prefix must be 32 characters or less";
    }
    const regex = /^[a-z0-9-]+$/;
    if (!regex.test(clean)) {
      return "Prefix must only contain lowercase letters, numbers, and hyphens (e.g. 'my-gpt-3')";
    }
    return null;
  };

  const handleSaveConnectionPrefix = async (conn, newPrefix) => {
    const cleanPrefix = newPrefix.trim();
    const error = validatePrefix(cleanPrefix, false);
    if (error) {
      notify.error(error);
      return;
    }

    setSavingId(`conn_${conn.id}`);
    try {
      // Build updated providerSpecificData object
      const providerSpecific = {
        ...(conn.providerSpecificData || {}),
      };

      if (cleanPrefix) {
        providerSpecific.prefix = cleanPrefix;
      } else {
        delete providerSpecific.prefix;
      }

      const res = await fetch(`/api/providers/${conn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSpecificData: providerSpecific,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state
        setConnections(prev =>
          prev.map(c => (c.id === conn.id ? { ...c, providerSpecificData: providerSpecific } : c))
        );
        notify.success(`Prefix for "${conn.name}" updated successfully`);
        setEditingId(null);
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to save prefix");
      }
    } catch (err) {
      notify.error("Connection error while saving prefix");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveNodePrefix = async (node, newPrefix) => {
    const cleanPrefix = newPrefix.trim();
    const error = validatePrefix(cleanPrefix, true);
    if (error) {
      notify.error(error);
      return;
    }

    setSavingId(`node_${node.id}`);
    try {
      const res = await fetch(`/api/provider-nodes/${node.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: node.name,
          prefix: cleanPrefix,
          baseUrl: node.baseUrl,
          apiType: node.apiType,
        }),
      });

      if (res.ok) {
        // Update local state
        setNodes(prev =>
          prev.map(n => (n.id === node.id ? { ...n, prefix: cleanPrefix } : n))
        );
        notify.success(`Prefix for Custom Node "${node.name}" updated successfully`);
        setEditingId(null);
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to save prefix");
      }
    } catch (err) {
      notify.error("Connection error while saving prefix");
    } finally {
      setSavingId(null);
    }
  };

  // Process and filter lists
  const filteredConnections = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return connections.filter(conn => {
      const providerInfo = AI_PROVIDERS[conn.provider] || {};
      const providerName = providerInfo.name || conn.provider;
      const customPrefix = conn.providerSpecificData?.prefix || "";
      const defaultPrefix = getProviderAlias(conn.provider);

      const matchesSearch =
        !query ||
        conn.name.toLowerCase().includes(query) ||
        providerName.toLowerCase().includes(query) ||
        conn.provider.toLowerCase().includes(query) ||
        customPrefix.toLowerCase().includes(query) ||
        defaultPrefix.toLowerCase().includes(query);

      return matchesSearch;
    });
  }, [connections, searchQuery]);

  const filteredNodes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return nodes.filter(node => {
      const customPrefix = node.prefix || "";
      const typeLabel =
        node.type === "openai-compatible"
          ? "OpenAI Compatible"
          : node.type === "anthropic-compatible"
          ? "Anthropic Compatible"
          : "Custom Embedding";

      const matchesSearch =
        !query ||
        node.name.toLowerCase().includes(query) ||
        typeLabel.toLowerCase().includes(query) ||
        customPrefix.toLowerCase().includes(query) ||
        node.baseUrl.toLowerCase().includes(query);

      return matchesSearch;
    });
  }, [nodes, searchQuery]);

  const isSearching = !!searchQuery.trim();

  // Unified items list for "All" view
  const allItems = useMemo(() => {
    const connItems = filteredConnections.map(c => ({
      uniqueId: `conn_${c.id}`,
      type: "connection",
      raw: c,
      name: c.name,
      providerId: c.provider,
      providerName: AI_PROVIDERS[c.provider]?.name || c.provider,
      defaultPrefix: getProviderAlias(c.provider),
      customPrefix: c.providerSpecificData?.prefix || "",
      icon: `/providers/${c.provider}.png`,
      fallbackText: AI_PROVIDERS[c.provider]?.textIcon || c.provider.slice(0, 2).toUpperCase(),
      fallbackColor: AI_PROVIDERS[c.provider]?.color || "#4B5563",
      isActive: c.isActive !== false,
      previewModel: AI_PROVIDERS[c.provider]?.serviceKinds?.includes("embedding")
        ? "text-embedding-3-small"
        : c.provider === "gemini"
        ? "gemini-2.5-flash"
        : c.provider === "anthropic"
        ? "claude-3-5-sonnet"
        : "gpt-4o-mini",
    }));

    const nodeItems = filteredNodes.map(n => {
      const isAnthropic = n.type === "anthropic-compatible";
      const isEmbedding = n.type === "custom-embedding";
      const color = isAnthropic ? "#D97757" : isEmbedding ? "#8B5CF6" : "#10A37F";
      const textIcon = isAnthropic ? "AC" : isEmbedding ? "CE" : "OC";
      const typeLabel = isAnthropic
        ? "Anthropic Compatible"
        : isEmbedding
        ? "Custom Embedding"
        : "OpenAI Compatible";

      return {
        uniqueId: `node_${n.id}`,
        type: "node",
        raw: n,
        name: n.name,
        providerId: n.id,
        providerName: typeLabel,
        defaultPrefix: "", // Nodes have no default fallback, prefix is required
        customPrefix: n.prefix || "",
        icon: null,
        fallbackText: textIcon,
        fallbackColor: color,
        isActive: true,
        previewModel: isEmbedding ? "text-embedding-v1" : "gpt-4o",
      };
    });

    return [...connItems, ...nodeItems];
  }, [filteredConnections, filteredNodes]);

  const displayedItems = useMemo(() => {
    if (activeTab === "standard") return allItems.filter(i => i.type === "connection");
    if (activeTab === "custom") return allItems.filter(i => i.type === "node");
    return allItems;
  }, [allItems, activeTab]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Panel */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors text-xs font-semibold uppercase tracking-wider mb-1">
            <Link href="/dashboard/providers" className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Back to Providers
            </Link>
          </div>
          <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">settings_ethernet</span>
            Prefix Manager
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Set custom routing prefixes for provider connections to map standard endpoints dynamically.
          </p>
        </div>
      </div>

      {/* Info Card explaining how prefix routing works */}
      <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 flex gap-3.5 items-start">
        <span className="material-symbols-outlined text-brand-500 text-[22px] shrink-0 mt-0.5">info</span>
        <div className="text-xs sm:text-sm text-text-main leading-relaxed">
          <p className="font-semibold mb-1">How Custom Prefix Routing Works</p>
          <p className="text-text-muted mb-2">
            Standard routing uses provider IDs as the prefix (e.g. calling `gemini/gemini-2.5-flash` routes to your Google Gemini keys). By customizing the prefix (e.g. setting Gemini to `my-ai`), clients can request `my-ai/gemini-2.5-flash` instead.
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li>Standard connections default to their system alias if left blank.</li>
            <li>Custom compatible nodes (OpenAI/Anthropic compatible) **require** a unique prefix.</li>
            <li>Routing prefixes must consist of only lowercase letters, numbers, and hyphens.</li>
          </ul>
        </div>
      </div>

      {/* Toolbar - Search & Tab switcher */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-surface-2/20 p-4 rounded-xl border border-border-subtle">
        {/* Tabs */}
        <div className="flex bg-surface-3 p-1 rounded-lg border border-border-subtle/50 shrink-0">
          {[
            { id: "all", label: `All (${allItems.length})` },
            { id: "standard", label: `Standard Keys (${allItems.filter(i => i.type === "connection").length})` },
            { id: "custom", label: `Custom Providers (${allItems.filter(i => i.type === "node").length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-surface-2 shadow-sm text-text-main"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Batch Edit */}
        <div className="flex gap-2 items-center flex-1 max-w-md">
          <Input
            placeholder="Search connections by name, provider, or prefix..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon="search"
            className="flex-1"
          />
          {isSearching && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Clear
            </Button>
          )}
          {connections.length > 0 && (
            <Button
              variant="secondary"
              icon="layers"
              size="sm"
              onClick={() => setShowBatchModal(true)}
              className="shrink-0"
            >
              Batch Edit
            </Button>
          )}
        </div>
      </div>

      {/* Main List */}
      <Card>
        {loading ? (
          <div className="flex flex-col gap-3 py-4">
            <div className="h-10 bg-surface-2 animate-pulse rounded-lg w-full" />
            <div className="h-12 bg-surface-2 animate-pulse rounded-lg w-full" />
            <div className="h-12 bg-surface-2 animate-pulse rounded-lg w-full" />
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">
              settings_ethernet
            </span>
            <p className="text-text-main font-semibold mb-1">No connections found</p>
            <p className="text-xs text-text-muted">
              {isSearching ? "No results match your search query." : "Add a provider connection in the Providers page first."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted font-medium">
                  <th className="py-3 px-4 w-[25%]">Connection / Provider</th>
                  <th className="py-3 px-4 w-[15%]">Type</th>
                  <th className="py-3 px-4 w-[15%]">Default Prefix</th>
                  <th className="py-3 px-4 w-[25%]">Routing Prefix</th>
                  <th className="py-3 px-4 w-[20%]">Sample Model Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {displayedItems.map((item) => {
                  const isEditing = editingId === item.uniqueId;
                  const isSaving = savingId === item.uniqueId;
                  const activePrefix = item.customPrefix || item.defaultPrefix;
                  const validationError = isEditing ? validatePrefix(editValue, item.type === "node") : null;

                  return (
                    <tr
                      key={item.uniqueId}
                      className={`hover:bg-surface-2/20 transition-colors ${
                        !item.isActive ? "opacity-60" : ""
                      }`}
                    >
                      {/* Name & Icon */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className="size-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: item.fallbackColor + "15",
                            }}
                          >
                            <ProviderIcon
                              src={item.icon}
                              alt={item.name}
                              size={24}
                              className="object-contain rounded"
                              fallbackText={item.fallbackText}
                              fallbackColor={item.fallbackColor}
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-text-main truncate block">{item.name}</span>
                            <span className="text-[11px] text-text-muted">{item.providerName}</span>
                          </div>
                        </div>
                      </td>

                      {/* Type (Standard vs Custom) */}
                      <td className="py-4 px-4 align-middle">
                        <Badge variant={item.type === "node" ? "warning" : "success"} size="sm">
                          {item.type === "node" ? "Custom Node" : "Standard"}
                        </Badge>
                      </td>

                      {/* Default Prefix */}
                      <td className="py-4 px-4 align-middle font-mono text-xs">
                        {item.type === "node" ? (
                          <span className="text-text-subtle/40 italic">N/A</span>
                        ) : (
                          <Badge variant="default" size="sm">
                            {item.defaultPrefix}
                          </Badge>
                        )}
                      </td>

                      {/* Routing Prefix (Edit Inline) */}
                      <td className="py-4 px-4 align-middle">
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className={`px-2 py-1 text-xs font-mono bg-surface-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-text-main w-full max-w-[180px] ${
                                  validationError ? "border-red-500/60" : "border-brand-500/40"
                                }`}
                                autoFocus
                                disabled={isSaving}
                                placeholder={item.defaultPrefix || "Required prefix"}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !validationError) {
                                    if (item.type === "connection") {
                                      handleSaveConnectionPrefix(item.raw, editValue);
                                    } else {
                                      handleSaveNodePrefix(item.raw, editValue);
                                    }
                                  }
                                  if (e.key === "Escape") handleCancelEdit();
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (validationError) return;
                                  if (item.type === "connection") {
                                    handleSaveConnectionPrefix(item.raw, editValue);
                                  } else {
                                    handleSaveNodePrefix(item.raw, editValue);
                                  }
                                }}
                                disabled={!!validationError || isSaving}
                                className={`p-1 rounded bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 ${
                                  validationError ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                }`}
                                title="Save changes"
                              >
                                <span className="material-symbols-outlined text-[16px]">check</span>
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                                className="p-1 rounded bg-surface-3 hover:bg-red-500/10 hover:text-red-500 text-text-muted cursor-pointer"
                                title="Cancel"
                              >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                              </button>
                            </div>
                            {validationError && (
                              <p className="text-[10px] text-red-500 leading-tight max-w-[200px]">
                                {validationError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/prefix">
                            {item.customPrefix ? (
                              <Badge variant="primary" size="sm" className="font-mono">
                                {item.customPrefix}
                              </Badge>
                            ) : (
                              <span className="text-text-subtle font-mono text-xs">
                                {item.defaultPrefix} <span className="text-[10px] text-text-subtle/50 italic">(default)</span>
                              </span>
                            )}
                            <button
                              onClick={() => handleStartEdit(item.uniqueId, item.customPrefix)}
                              className="p-1 rounded text-text-muted hover:text-brand-500 opacity-0 group-hover/prefix:opacity-100 transition-opacity cursor-pointer"
                              title="Edit custom prefix"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                            {item.customPrefix && item.type === "connection" && (
                              <button
                                onClick={() => handleSaveConnectionPrefix(item.raw, "")}
                                className="p-1 rounded text-text-muted hover:text-red-500 opacity-0 group-hover/prefix:opacity-100 transition-opacity cursor-pointer"
                                title="Reset to default prefix"
                              >
                                <span className="material-symbols-outlined text-[14px]">rotate_left</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Sample Model Preview */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-0.5 rounded bg-surface-2 font-mono text-xs text-text-muted border border-border-subtle/40 tracking-tight">
                            {isEditing && !validationError && editValue.trim() ? (
                              <>
                                <span className="text-brand-500 font-semibold">{editValue.trim()}</span>
                                <span>/{item.previewModel}</span>
                              </>
                            ) : (
                              <>
                                <span>{activePrefix}</span>
                                <span>/{item.previewModel}</span>
                              </>
                            )}
                          </code>
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

      {/* Batch Edit Modal */}
      <Modal
        isOpen={showBatchModal}
        title="Batch Update Prefixes"
        onClose={() => {
          setShowBatchModal(false);
          setBatchProvider("");
          setBatchPrefix("");
        }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-muted">
            Update the custom routing prefix for all connections of a specific provider type in a single batch.
          </p>

          <Select
            label="Select Provider Type"
            placeholder="Choose provider..."
            value={batchProvider}
            onChange={(e) => setBatchProvider(e.target.value)}
            options={uniqueProvidersList.map(p => ({ value: p.id, label: p.name }))}
            required
          />

          <Input
            label="New Custom Prefix"
            value={batchPrefix}
            onChange={(e) => setBatchPrefix(e.target.value)}
            placeholder="e.g. oai-custom"
            hint="All connections of the selected provider will receive this prefix. Leave blank and click Apply to reset all to default."
            disabled={!batchProvider}
          />

          {batchProvider && (
            <div className="bg-surface-2 p-3 rounded-lg border border-border-subtle/50 text-xs">
              <span className="font-semibold text-text-main block mb-1">Preview Effect:</span>
              <p className="text-text-muted">
                All {connections.filter(c => c.provider === batchProvider).length} connection(s) will route using:
                <code className="ml-1 px-1 py-0.5 rounded bg-surface-3 font-mono text-brand-500">
                  {batchPrefix.trim() ? batchPrefix.trim() : getProviderAlias(batchProvider)}
                </code>
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <Button
              onClick={() => {
                setShowBatchModal(false);
                setBatchProvider("");
                setBatchPrefix("");
              }}
              variant="ghost"
              disabled={batchSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBatchPrefix}
              disabled={!batchProvider || batchSaving || !!validatePrefix(batchPrefix, false)}
            >
              {batchSaving ? "Applying..." : "Apply to All"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
