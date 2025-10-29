// src/pages/CreateUserForm.jsx
import React, { useState } from "react";
import { adminCreateUser } from "../api.js";

export default function CreateUserForm({ assistants = [] }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedAssistants, setSelectedAssistants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function toggleAssistant(id) {
    setSelectedAssistants(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMsg(null);

    if (!username.trim() || !password) {
      setMsg({ type: "error", text: "Username and password are required." });
      return;
    }
    if (selectedAssistants.length === 0) {
      setMsg({ type: "error", text: "Select at least one assistant." });
      return;
    }

    setLoading(true);
    try {
      await adminCreateUser({
        username: username.trim(),
        password,
        allowedAssistantIds: selectedAssistants,
      });
      setMsg({ type: "success", text: "User created successfully." });
      setUsername("");
      setPassword("");
      setSelectedAssistants([]);

      // Notify UserList to reload
      window.dispatchEvent(new CustomEvent("admin:user:created"));
    } catch (err) {
      console.error("CreateUserForm:", err);
      setMsg({ type: "error", text: err.message || "Failed to create user" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="stack">
      <label>Username</label>
      <input
        className="input"
        value={username}
        onChange={e => setUsername(e.target.value)}
      />

      <label>Password</label>
      <input
        className="input"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />

      <label>Assign Assistants <span style={{ color: "#b00020" }}>*</span></label>
      <div
        style={{
          display: "grid",
          gap: 6,
          maxHeight: 140,
          overflow: "auto",
          padding: 6,
          borderRadius: 8,
          border: "1px dashed #e6eaf1",
        }}
      >
        {assistants.length === 0 ? (
          <div className="muted">No assistants available.</div>
        ) : (
          assistants.map(a => (
            <label
              key={a.key}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={selectedAssistants.includes(a.key)}
                onChange={() => toggleAssistant(a.key)}
              />
              <span>{a.name}</span>
            </label>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="button primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create user"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginTop: 8,
            color: msg.type === "error" ? "#b00020" : "#0b9738",
          }}
        >
          {msg.text}
        </div>
      )}
    </form>
  );
}
