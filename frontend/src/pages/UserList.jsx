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
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // listen for create/update events dispatched elsewhere (CreateUserForm, EditUserModal)
    const createdHandler = () => load();
    const updatedHandler = () => load();
    window.addEventListener("admin:user:created", createdHandler);
    window.addEventListener("admin:user:updated", updatedHandler);
    return () => {
      window.removeEventListener("admin:user:created", createdHandler);
      window.removeEventListener("admin:user:updated", updatedHandler);
    };
  }, []);

  async function doDelete(userId) {
    if (!confirm("Delete user? This cannot be undone.")) return;
    setProcessingId(userId);
    try {
      await adminDeleteUser(userId);
      await load();
      alert("User deleted.");
    } catch (err) {
      // try to show a helpful message
      const msg = err?.message || (err?.error) || "Delete failed";
      alert(msg);
      console.error("delete user error:", err);
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

        {users.map(u => {
          const id = u._id || u.id || u._id?.toString();
          const assistantIds = Array.isArray(u.assistantIds) && u.assistantIds.length > 0
            ? u.assistantIds
            : (Array.isArray(u.allowedAssistantIds) ? u.allowedAssistantIds : []);

          return (
            <div
              key={id}
              className="card-lite"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.username}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Allowed assistants:{" "}
                  {assistantIds.length === 0
                    ? "—"
                    : assistantIds
                        .map(id => assistants.find(a => a.key === id)?.name || id)
                        .join(", ")}
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
                  disabled={processingId === id}
                  onClick={() => doDelete(id)}
                >
                  {processingId === id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
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
