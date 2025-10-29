// src/pages/UserList.jsx
import React, { useEffect, useState } from "react";
import {
  adminListUsers,
  adminDeleteUser,
} from "../api.js";
import EditUserModal from "./EditUserModal.jsx";

export default function UserList({ assistants = [] }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [showEdit, setShowEdit] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const out = await adminListUsers();
      setUsers(Array.isArray(out) ? out : []);
    } catch (err) {
      console.error("UserList.load:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("admin:user:created", handler);
    return () => window.removeEventListener("admin:user:created", handler);
  }, []);

  async function doDelete(userId) {
    if (!confirm("Delete user? This cannot be undone.")) return;
    setProcessingId(userId);
    try {
      await adminDeleteUser(userId);
      await load();
    } catch (err) {
      alert(err.message || "Delete failed");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div>
      {loading && <div className="muted">Loading users…</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {users.length === 0 && !loading ? (
          <div className="muted">No users found.</div>
        ) : null}
        {users.map(u => (
          <div
            key={u._id || u.id}
            className="card-lite"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{u.username}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Allowed assistants:{" "}
                {(u.allowedAssistantIds || [])
                  .map(
                    id => assistants.find(a => a.key === id)?.name || id
                  )
                  .join(", ") || "—"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="button ghost"
                onClick={() => setShowEdit(u)}
              >
                Edit
              </button>
              <button
                className="button ghost"
                disabled={processingId === (u._id || u.id)}
                onClick={() => doDelete(u._id || u.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showEdit && (
        <EditUserModal
          user={showEdit}
          assistants={assistants}
          onClose={() => setShowEdit(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
