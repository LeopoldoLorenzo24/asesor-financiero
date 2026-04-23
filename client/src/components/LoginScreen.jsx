import React, { useState, useEffect } from "react";
import { T, S, gridBg } from "../theme";
import { auth } from "../api";

export default function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);

  useEffect(() => {
    auth.status().then((s) => setMode(s.canRegister ? "register" : "login")).catch(() => setMode("login"));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "register") await auth.register(email, password);
      else await auth.login(email, password);
      onAuth();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
      ...gridBg,
    }}>
      {/* Animated ambient orbs */}
      <div style={{
        position: "fixed", top: "10%", left: "10%", width: 400, height: 400,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${T.green}10, transparent 60%)`,
        pointerEvents: "none", animation: "pulse-glow 8s ease-in-out infinite",
        filter: "blur(60px)",
      }} />
      <div style={{
        position: "fixed", bottom: "15%", right: "10%", width: 500, height: 500,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${T.purple}08, transparent 60%)`,
        pointerEvents: "none", animation: "pulse-glow 10s ease-in-out infinite 2s",
        filter: "blur(80px)",
      }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", width: 600, height: 600,
        borderRadius: "50%", transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle, ${T.cyan}05, transparent 50%)`,
        pointerEvents: "none", filter: "blur(100px)",
      }} />

      <div style={{ width: "92%", maxWidth: 440, animation: "fadeUp 0.6s ease", position: "relative", zIndex: 2 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72,
            background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
            borderRadius: 20,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, fontWeight: 900, color: T.bg,
            fontFamily: T.fontMono,
            boxShadow: `0 8px 40px ${T.green}40, 0 0 0 1px rgba(255,255,255,0.1) inset, 0 0 60px ${T.green}20`,
            marginBottom: 24,
            position: "relative", overflow: "hidden",
          }}>
            <span style={{ position: "relative", zIndex: 2 }}>₵</span>
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)`,
            }} />
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, margin: 0, letterSpacing: "-1px",
            background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>CEDEAR ADVISOR</h1>
          <p style={{ fontSize: 10, color: T.textDark, letterSpacing: "4px", marginTop: 8, fontWeight: 700, fontFamily: T.fontMono }}>
            MOTOR DE INVERSIÓN IA v3
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} style={{
          ...S.card,
          padding: 36,
          background: "rgba(13,18,30,0.7)",
          border: `1px solid ${T.borderLight}`,
          boxShadow: `0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>
              {mode === "register" ? "Crear Cuenta" : "Iniciar Sesión"}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: T.textDim }}>
              {mode === "register" ? "Registrate para empezar" : "Ingresá tus credenciales"}
            </p>
          </div>

          {error && (
            <div style={{
              background: `${T.red}10`, border: `1px solid ${T.red}30`,
              borderRadius: 12, padding: 14, marginBottom: 20,
              fontSize: 12, color: T.red, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={{ ...S.label, display: "block", marginBottom: 8, fontSize: 11 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              placeholder="tu@email.com"
              required
              style={{
                ...S.input,
                borderColor: focused === "email" ? `${T.green}40` : T.border,
                boxShadow: focused === "email" ? `0 0 0 3px ${T.green}10` : "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ ...S.label, display: "block", marginBottom: 8, fontSize: 11 }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                ...S.input,
                borderColor: focused === "password" ? `${T.green}40` : T.border,
                boxShadow: focused === "password" ? `0 0 0 3px ${T.green}10` : "none",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...S.btn(),
              width: "100%", padding: "14px 24px", fontSize: 15,
              opacity: loading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: `2px solid rgba(255,255,255,0.3)`,
                  borderTopColor: "#fff",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                Procesando...
              </>
            ) : (
              <>{mode === "register" ? "Registrarme →" : "Entrar →"}</>
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 11, color: T.textDark, marginTop: 24, fontFamily: T.fontMono }}>
          Acceso exclusivo · Un solo usuario autorizado
        </p>
      </div>
    </div>
  );
}
