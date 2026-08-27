// src/pages/Login.jsx
import { useState } from "react";
import { Shield, LogIn, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { strings } from "../i18n/strings";
import "./Login.css";

export default function Login({ onLoginSuccess, lang = "en" }) {
  const t = strings[lang] || strings.en;

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isOffline] = useState(!navigator.onLine);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data?.session) {
          setSuccessMsg("Account created and logged in!");
          if (onLoginSuccess) onLoginSuccess(data.session);
        } else {
          setSuccessMsg("Account created! Please check your email for confirmation, then log in.");
          setIsSignUp(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data?.session) {
          if (onLoginSuccess) onLoginSuccess(data.session);
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      setErrorMsg(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Top Banner — Offline Mode Warning (only when actually offline) */}
      {isOffline && (
        <div className="login-warning-banner" role="alert">
          <AlertTriangle size={16} className="banner-icon" />
          <span>Offline Mode - Cached Data Only</span>
        </div>
      )}

      {/* Main Login Card */}
      <div className="login-card-container">
        <div className="login-card">
          {/* Shield Badge */}
          <div className="shield-icon-wrapper">
            <Shield size={32} className="shield-icon" />
          </div>

          <h1 className="login-title">Caregiver Portal</h1>
          <h2 className="login-subtitle">Secure Login</h2>
          <p className="login-description">
            Welcome back. Please enter your credentials to access patient data.
          </p>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="login-alert error">
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="login-alert success">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="e.g. name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="login-btn-primary"
              disabled={loading}
            >
              {loading ? (
                <span className="btn-spinner" />
              ) : (
                <>
                  <span>{isSignUp ? "Sign Up" : "Log In"}</span>
                  <LogIn size={18} className="btn-arrow" />
                </>
              )}
            </button>
          </form>

          {/* Account toggle link */}
          <div className="login-footer">
            <button
              type="button"
              className="toggle-account-btn"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg("");
                setSuccessMsg("");
              }}
            >
              <span>{isSignUp ? "Already have an account? Log In" : "Create Caregiver Account"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
