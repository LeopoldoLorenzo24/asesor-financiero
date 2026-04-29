import React, { useState, useEffect } from "react";
import {
  BarChart2, ShieldCheck, FlaskConical, Brain,
  Lock, TrendingUp, Mail, Eye, EyeOff, ArrowRight,
  KeyRound,
} from "lucide-react";
import { T, S, gridBg } from "../theme";
import { auth } from "../api";

const features = [
  { Icon: BarChart2,    title: "Core / Satellite",    desc: "ETFs por defecto, picks solo con convicción real" },
  { Icon: ShieldCheck,  title: "Gobernanza Estricta",  desc: "Sharpe ≥1.0, drawdown <15%, 90 días de evidencia" },
  { Icon: FlaskConical, title: "Paper Realista",       desc: "Comisiones argentinas, slippage y lotes BYMA" },
  { Icon: Brain,        title: "IA Mensual",           desc: "Claude analiza ~226 CEDEARs con datos reales" },
  { Icon: Lock,         title: "Seguridad 2FA",        desc: "Autenticación de dos factores para capital real" },
  { Icon: TrendingUp,   title: "Track Record",         desc: "Evidencia exportable a CSV, alpha vs SPY" },
];

export default function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requireTotp, setRequireTotp] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const [featureIndex, setFeatureIndex] = useState(0);

  useEffect(() => {
    auth.status().then((s) => setMode(s.canRegister ? "register" : "login")).catch(() => setMode("login"));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setFeatureIndex((i) => (i + 1) % features.length), 3200);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") await auth.register(email, password);
      else await auth.login(email, password, requireTotp ? totpCode : "");
      onAuth();
    } catch (err) {
      const message = err.message || "Error de autenticación";
      if (mode === "login" && /2FA|Código 2FA/i.test(message)) {
        setRequireTotp(true);
        setError("Ingresá tu código de autenticación de 6 dígitos.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const { Icon: FeatureIcon } = features[featureIndex];

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      padding: "24px 16px",
      ...gridBg,
    }}>
      {/* Ambient orbs */}
      <div style={{
        position: "fixed", top: "8%", left: "5%",
        width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.green}0e, transparent 65%)`,
        pointerEvents: "none",
        filter: "blur(60px)",
        animation: "pulse-glow 9s ease-in-out infinite",
      }} />
      <div style={{
        position: "fixed", bottom: "10%", right: "5%",
        width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.purple}09, transparent 60%)`,
        pointerEvents: "none",
        filter: "blur(80px)",
        animation: "pulse-glow 12s ease-in-out infinite 3s",
      }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        width: 800, height: 800, borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle, ${T.cyan}05, transparent 55%)`,
        pointerEvents: "none",
        filter: "blur(100px)",
      }} />

      <div style={{
        width: "100%", maxWidth: 420,
        animation: "fadeUp 0.55s cubic-bezier(0.4,0,0.2,1)",
        position: "relative", zIndex: 2,
      }}>
        {/* Brand lockup */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 68, height: 68,
            background: `linear-gradient(135deg, ${T.green} 0%, ${T.cyan} 100%)`,
            borderRadius: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 40px ${T.green}38, 0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 70px ${T.green}18`,
            marginBottom: 20,
            position: "relative",
            overflow: "hidden",
            animation: "float 5s ease-in-out infinite",
          }}>
            <span style={{
              fontFamily: T.fontMono,
              fontWeight: 900,
              fontSize: 22,
              color: "#020617",
              position: "relative",
              zIndex: 2,
              letterSpacing: "-1px",
            }}>CA</span>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)",
            }} />
          </div>

          <h1 style={{
            margin: "0 0 6px",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-1px",
            color: T.text,
            lineHeight: 1.1,
          }}>
            CEDEAR{" "}
            <span style={{
              background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              ADVISOR
            </span>
          </h1>
          <p style={{
            margin: 0,
            fontSize: 10,
            color: T.textDark,
            letterSpacing: "3px",
            fontWeight: 700,
            fontFamily: T.fontMono,
            textTransform: "uppercase",
          }}>
            Motor de Inversión IA
          </p>
        </div>

        {/* Feature carousel */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            background: T.bgCard,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${T.border}`,
            borderRadius: 16,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            minHeight: 60,
            transition: "all 0.4s ease",
          }}>
            <div style={{
              width: 38, height: 38,
              borderRadius: 10,
              background: `${T.green}12`,
              border: `1px solid ${T.green}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <FeatureIcon size={17} color={T.green} strokeWidth={1.8} />
            </div>
            <div style={{ animation: "fadeIn 0.3s ease" }} key={featureIndex}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>
                {features[featureIndex].title}
              </div>
              <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5 }}>
                {features[featureIndex].desc}
              </div>
            </div>
          </div>

          {/* Dot indicators */}
          <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 10 }}>
            {features.map((_, i) => (
              <div
                key={i}
                onClick={() => setFeatureIndex(i)}
                style={{
                  width: i === featureIndex ? 18 : 5,
                  height: 5,
                  borderRadius: 3,
                  background: i === featureIndex ? T.green : "rgba(148,163,184,0.18)",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {/* Login / Register card */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: "rgba(15,23,42,0.75)",
            backdropFilter: "blur(32px) saturate(160%)",
            WebkitBackdropFilter: "blur(32px) saturate(160%)",
            border: `1px solid ${T.borderLight}`,
            borderRadius: 22,
            padding: "32px 30px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ marginBottom: 26 }}>
            <h2 style={{
              margin: "0 0 4px",
              fontSize: 18,
              fontWeight: 800,
              color: T.text,
              letterSpacing: "-0.3px",
            }}>
              {mode === "register" ? "Crear cuenta" : "Bienvenido de vuelta"}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: T.textDim, lineHeight: 1.5 }}>
              {mode === "register"
                ? "Completá el formulario para comenzar"
                : "Ingresá tus credenciales para continuar"}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: `${T.red}0e`,
              border: `1px solid ${T.red}30`,
              borderLeft: `3px solid ${T.red}`,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 20,
              fontSize: 13,
              color: T.red,
              fontWeight: 500,
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: T.textDim,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              marginBottom: 8,
              fontFamily: T.fontMono,
            }}>
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={15}
                color={focused === "email" ? T.green : T.textDark}
                strokeWidth={2}
                style={{
                  position: "absolute",
                  left: 14, top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  transition: "color 0.2s",
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                style={{
                  ...S.input,
                  paddingLeft: 42,
                  fontSize: 14,
                  borderColor: focused === "email" ? `${T.green}45` : T.border,
                  boxShadow: focused === "email" ? `0 0 0 3px ${T.green}0f` : "none",
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: requireTotp ? 16 : 28 }}>
            <label style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: T.textDim,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              marginBottom: 8,
              fontFamily: T.fontMono,
            }}>
              Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={15}
                color={focused === "password" ? T.green : T.textDark}
                strokeWidth={2}
                style={{
                  position: "absolute",
                  left: 14, top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  transition: "color 0.2s",
                }}
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                style={{
                  ...S.input,
                  paddingLeft: 42,
                  paddingRight: 44,
                  fontSize: 14,
                  borderColor: focused === "password" ? `${T.green}45` : T.border,
                  boxShadow: focused === "password" ? `0 0 0 3px ${T.green}0f` : "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12, top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: T.textDim,
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 6,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.textMuted; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.textDim; }}
              >
                {showPassword
                  ? <EyeOff size={15} strokeWidth={2} />
                  : <Eye size={15} strokeWidth={2} />
                }
              </button>
            </div>
          </div>

          {/* 2FA */}
          {mode === "login" && requireTotp && (
            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: T.textDim,
                textTransform: "uppercase",
                letterSpacing: "1.5px",
                marginBottom: 8,
                fontFamily: T.fontMono,
              }}>
                Código 2FA
              </label>
              <div style={{ position: "relative" }}>
                <KeyRound
                  size={15}
                  color={T.cyan}
                  strokeWidth={2}
                  style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="• • • • • •"
                  required
                  autoComplete="one-time-code"
                  style={{
                    ...S.input,
                    paddingLeft: 42,
                    letterSpacing: "6px",
                    textAlign: "center",
                    fontSize: 20,
                    fontFamily: T.fontMono,
                    borderColor: `${T.cyan}45`,
                    boxShadow: `0 0 0 3px ${T.cyan}0f`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || mode === null}
            style={{
              width: "100%",
              padding: "13px 24px",
              borderRadius: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: T.font,
              fontWeight: 700,
              fontSize: 15,
              background: `linear-gradient(135deg, ${T.green} 0%, #00c87a 100%)`,
              color: "#020617",
              boxShadow: `0 6px 24px ${T.green}2e, inset 0 1px 0 rgba(255,255,255,0.22)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "all 0.2s",
              opacity: loading || mode === null ? 0.65 : 1,
              transform: "translateY(0)",
            }}
            onMouseEnter={(e) => {
              if (!loading && mode !== null) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = `0 10px 32px ${T.green}3a, inset 0 1px 0 rgba(255,255,255,0.22)`;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = `0 6px 24px ${T.green}2e, inset 0 1px 0 rgba(255,255,255,0.22)`;
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 17, height: 17,
                  borderRadius: "50%",
                  border: "2.5px solid rgba(2,6,23,0.25)",
                  borderTopColor: "#020617",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                Procesando…
              </>
            ) : (
              <>
                {mode === "register" ? "Crear cuenta" : "Entrar"}
                <ArrowRight size={17} strokeWidth={2.5} />
              </>
            )}
          </button>
        </form>

        <p style={{
          textAlign: "center",
          fontSize: 11,
          color: T.textDark,
          marginTop: 20,
          fontFamily: T.fontMono,
          letterSpacing: "0.5px",
        }}>
          Acceso privado · Un solo usuario autorizado
        </p>
      </div>
    </div>
  );
}
