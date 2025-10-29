// src/pages/EditUserModal.jsx
import React, { useState } from "react";
import { adminResetUserPassword, adminCreateUser } from "../api.js";

export default function EditUserModal({ user, assistants = [], onClose, onUpdated }) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [selectedAssistants, setSelectedAssistants] = useState(
    user.allowedAssistantIds || []
  );
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  function toggleAssistant(id) {
    setSelectedAssistants(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setMsg(null);
    if (selectedAssistants.length === 0) {
      setMsg({ type: "error", text: "Select at least one assistant." });
      return;
    }

    setLoading(true);
    try {
      // Reuse create endpoint as update (your backend should support PUT or POST to same path)
      await adminCreateUser({
        username,
        password,
        allowedAssistantIds: selectedAssistants,
        id: user._id || user.id,
      });

      setMsg({ type: "success", text: "User updated successfully." });
      onUpdated && onUpdated();
      setTimeout(onClose, 600);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Update failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>Edit User</h3>
        <form onSubmit={handleSave} className="stack">
          <label>Username</label>
          <input
            className="input"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />

          <label>New Password (optional)</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <label>Reassign Assistants <span style={{ color: "#b00020" }}>*</span></label>
          <div
            style={{
              display: "grid",
              gap: 6,
              maxHeight: 120,
              overflow: "auto",
              padding: 6,
              border: "1px dashed #e6eaf1",
              borderRadius: 8,
            }}
          >
            {assistants.map(a => (
              <label key={a.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedAssistants.includes(a.key)}
                  onChange={() => toggleAssistant(a.key)}
                />
                <span>{a.name}</span>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="button primary" type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Cancel
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
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  width: "min(450px, 90%)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
};
