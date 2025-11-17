import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api.js";

export default function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 420 }}>
        
        {/* ⭐ Allianz Logo (replaces the ring) */}
        <img
          src="/allianz-logo.png"
          alt="Allianz Logo"
          style={{
            width: 120,
            height: "auto",
            display: "block",
            margin: "0 auto 10px auto"
          }}
        />

        <h2 className="form-title">Welcome to Allianz Agent Tools</h2>
        <p className="form-sub">Sign in to continue</p>

        <form className="stack" onSubmit={onSubmit}>
          <label>Username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div style={{ color: "crimson" }}>{error}</div>}

          <button className="button primary" type="submit">
            Sign in
          </button>
        </form>

        {/* 
        <div className="row" style={{ marginTop: 10 }}>
          <span>New here?</span>
          <Link to="/signup" className="button ghost">Sign up</Link>
        </div> 
        */}
      </div>
    </div>
  );
}
