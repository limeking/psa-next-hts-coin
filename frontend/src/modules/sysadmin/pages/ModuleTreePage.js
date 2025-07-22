
import React, { useState, useEffect } from "react";

function getIcon(type, name) {
  if (type === "folder") return "📁";
  if (type === "file" && name.endsWith('.py')) return "🐍";
  if (type === "file" && name.endsWith('.js')) return "🟨";
  if (type === "file" && name.endsWith('.json')) return "📝";
  if (type === "file" && name.endsWith('.sql')) return "🗄️";
  return "📄";
}

function TreeNode({ node, level = 0, onSelect, selected }) {
  const [expanded, setExpanded] = useState(level < 2);
  const isFolder = node.type === "folder" || node.children;
  const isSelected = selected && selected.path === node.path;

  return (
    <div style={{ marginLeft: level * 14, background: isSelected ? "#f0f6ff" : "none", borderRadius: 6 }}>
      <div
        style={{ cursor: isFolder ? "pointer" : "default", fontWeight: isSelected ? "bold" : "normal", display: "flex", alignItems: "center" }}
        onClick={() => {
          if (isFolder) setExpanded(e => !e);
          onSelect && onSelect(node);
        }}
      >
        {isFolder && (
          <span style={{ width: 16 }}>{expanded ? "▼" : "▶"}</span>
        )}
        <span style={{ marginLeft: 2, marginRight: 6 }}>{getIcon(node.type, node.name)}</span>
        <span>{node.name}</span>
      </div>
      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child, i) =>
            <TreeNode
              key={child.name + i + (child.path || "")}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selected={selected}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ModuleInfoBox({ selectedNode }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!selectedNode) { setInfo(null); return; }
    // 경로에서 모듈명 추출
    const match = selectedNode.path && selectedNode.path.match(/modules\/([^/]+)/);
    const moduleName = match ? match[1] : null;
    if (!moduleName) { setInfo(null); return; }

    fetch("/api/sysadmin/modules")
      .then(res => res.json())
      .then(list => {
        const found = list.find(m => m.name === moduleName);
        setInfo(found || null);
      });
  }, [selectedNode]);

  if (!selectedNode || !info) return <div style={{ color: "#888" }}>모듈을 선택하세요</div>;

  return (
    <div className="border p-3 rounded shadow bg-white mt-3" style={{ minWidth: 320 }}>
      <div className="font-bold mb-1 text-lg">모듈: {info.name}</div>
      <div>설명: {info.meta?.description || "-"}</div>
      <div>경로: <code>{selectedNode.path}</code></div>
      <div>백엔드: {info.backend ? "✅" : "❌"}, 프론트: {info.frontend ? "✅" : "❌"}, DB: {info.db ? "✅" : "❌"}</div>
      <div>생성일: {info.meta?.created_at || "-"}</div>
      <div>ws_needed: {info.meta?.ws_needed ? "True" : "False"}</div>
      <div>상태: <span style={{ color: info.enabled ? "#36ba46" : "#e94040" }}>{info.enabled ? "Enabled" : "Disabled"}</span></div>
      {info.meta && (
        <pre style={{ background: "#f7f7f7", padding: 6, borderRadius: 6, marginTop: 6 }}>
          {JSON.stringify(info.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ModuleTreePage() {
  const [tree, setTree] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetch("/api/sysadmin/module-tree")
      .then(res => res.json())
      .then(data => {
        // 각 노드에 path(트리 경로) 추가
        const addPath = (node, parent = "") => {
          node.path = parent ? parent + "/" + node.name : node.name;
          if (node.children) node.children.forEach(child => addPath(child, node.path));
          return node;
        };
        setTree(addPath(data));
      });
  }, []);

  return (
    <div style={{ display: "flex", gap: 32 }}>
      <div style={{ minWidth: 320 }}>
        {tree ? (
          <TreeNode node={tree} onSelect={setSelectedNode} selected={selectedNode} />
        ) : (
          <div>트리 구조 불러오는 중...</div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <ModuleInfoBox selectedNode={selectedNode} />
      </div>
    </div>
  );
}
