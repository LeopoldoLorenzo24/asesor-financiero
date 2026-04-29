import React, { useState } from "react";
import {
  Sparkles, PieChart, ShieldCheck, FlaskConical,
  Brain, BarChart2, Lock, Rocket,
} from "lucide-react";
import { T, S } from "../theme";

const steps = [
  {
    id: "welcome",
    Icon: Sparkles,
    subtitle: "Motor de inversión con IA",
    title: "Bienvenido a CEDEAR Advisor",
    description: "Este sistema te ayuda a invertir en CEDEARs con una estrategia profesional Core/Satellite, gobernanza de capital y evidencia real.",
    color: T.green,
  },
  {
    id: "philosophy",
    Icon: PieChart,
    subtitle: "SPY es el default",
    title: "Filosofía Core/Satellite",
    description: "El sistema siempre prefiere ETFs (SPY/QQQ) como core. Solo recomienda picks individuales cuando hay convicción REAL de que le ganan al mercado. Si no hay picks claros: 100% core.",
    color: T.blue,
  },
  {
    id: "governance",
    Icon: ShieldCheck,
    subtitle: "No operamos a ciegas",
    title: "Gobernanza de Capital",
    description: "El sistema NO te deja poner capital real hasta demostrar edge estadístico: 90 días de track record, Sharpe ≥ 1.0, drawdown < 15%, y win rate > 60% vs SPY.",
    color: T.cyan,
  },
  {
    id: "paper",
    Icon: FlaskConical,
    subtitle: "Simulación con costos reales",
    title: "Paper Trading Realista",
    description: "Antes de capital real, todo pasa por paper trading con comisiones de broker argentino, lotes BYMA, slippage por liquidez, partial fills, y dividendos netos de impuestos.",
    color: T.purple,
  },
  {
    id: "analysis",
    Icon: Brain,
    subtitle: "Claude + datos reales",
    title: "Análisis Mensual con IA",
    description: "Una vez al mes el sistema analiza ~226 CEDEARs, corre backtests, verifica consistencia numérica, aplica límites de riesgo y genera un plan ejecutable. Cooldown de 1 hora entre análisis.",
    color: T.pink,
  },
  {
    id: "track",
    Icon: BarChart2,
    subtitle: "Datos, no opiniones",
    title: "Track Record y Evidencia",
    description: "Cada día el sistema guarda: valor virtual, valor real, benchmark SPY, alpha, drawdown, Sharpe. Todo exportable a CSV. La evidencia decide si se permite capital real.",
    color: T.yellow,
  },
  {
    id: "security",
    Icon: Lock,
    subtitle: "2FA para capital real",
    title: "Seguridad",
    description: "Operar con capital real requiere autenticación de dos factores (TOTP). El sistema también tiene circuit breakers macro: si el CCL explota o hay crisis cambiaria, se congela automáticamente.",
    color: T.red,
  },
  {
    id: "ready",
    Icon: Rocket,
    subtitle: "Empezá con paper trading",
    title: "Estás listo",
    description: "Corré tu primer análisis de IA, sincronizá el portfolio virtual, y dejá que el sistema acumule evidencia. Cuando los números lo justifiquen, el readiness te habilitará capital real incremental.",
    color: T.green,
  },
];

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const { Icon } = step;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    } else {
      localStorage.setItem("cedear_onboarding_seen", "true");
      setIsVisible(false);
      setTimeout(onComplete, 400);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("cedear_onboarding_seen", "true");
    setIsVisible(false);
    setTimeout(onComplete, 400);
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: T.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.4s ease",
      overflow: "auto",
      padding: "24px 16px",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: "10%", left: "10%",
        width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${step.color}0a 0%, transparent 70%)`,
        filter: "blur(60px)",
        animation: "float 7s ease-in-out infinite",
        pointerEvents: "none",
        transition: "background 0.5s ease",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", right: "10%",
        width: 400, height: 400, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.blue}07 0%, transparent 70%)`,
        filter: "blur(60px)",
        animation: "float 9s ease-in-out infinite reverse",
        pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 620, position: "relative", zIndex: 2 }}>

        {/* Top controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", fontWeight: 700 }}>
            {currentStep + 1} / {steps.length}
          </span>
          <button
            onClick={handleSkip}
            style={{
              background: "none", border: `1px solid ${T.border}`,
              borderRadius: 9, color: T.textDim,
              fontSize: 12, cursor: "pointer",
              fontFamily: T.font, fontWeight: 600,
              padding: "6px 14px", transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.textMuted; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
          >
            Saltar tour
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ height: 3, background: "rgba(148,163,184,0.08)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: `linear-gradient(90deg, ${step.color}, ${step.color}90)`,
              borderRadius: 3,
              transition: "width 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: `0 0 10px ${step.color}50`,
            }} />
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 36 }}>
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setDirection(i > currentStep ? 1 : -1); setCurrentStep(i); }}
              aria-label={`Ir al paso ${i + 1}`}
              style={{
                width: i === currentStep ? 28 : 7, height: 7,
                borderRadius: 4, border: "none",
                cursor: "pointer",
                transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                background: i === currentStep
                  ? step.color
                  : i < currentStep
                  ? `${step.color}40`
                  : "rgba(148,163,184,0.14)",
                boxShadow: i === currentStep ? `0 0 10px ${step.color}60` : "none",
              }}
            />
          ))}
        </div>

        {/* Main card */}
        <div
          key={step.id}
          style={{
            background: "rgba(15, 23, 42, 0.78)",
            backdropFilter: "blur(32px) saturate(160%)",
            WebkitBackdropFilter: "blur(32px) saturate(160%)",
            border: `1px solid ${step.color}22`,
            borderRadius: 24,
            padding: "44px 40px",
            textAlign: "center",
            boxShadow: `0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset`,
            animation: "scaleIn 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Icon */}
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: `linear-gradient(135deg, ${step.color}22, ${step.color}10)`,
            border: `1px solid ${step.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 28px",
            boxShadow: `0 8px 32px ${step.color}20`,
            animation: "float 4s ease-in-out infinite",
          }}>
            <Icon size={30} color={step.color} strokeWidth={1.6} />
          </div>

          <div style={{
            fontSize: 10, color: step.color,
            fontFamily: T.fontMono,
            textTransform: "uppercase",
            letterSpacing: "3px",
            fontWeight: 800, marginBottom: 10,
          }}>
            {step.subtitle}
          </div>

          <h2 style={{
            fontSize: 26, fontWeight: 800, color: T.text,
            margin: "0 0 16px", letterSpacing: "-0.5px", lineHeight: 1.25,
          }}>
            {step.title}
          </h2>

          <p style={{
            fontSize: 14, color: T.textMuted, lineHeight: 1.8,
            margin: "0 auto", maxWidth: 460,
          }}>
            {step.description}
          </p>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 28 }}>
          {currentStep > 0 && (
            <button
              onClick={handlePrev}
              style={{
                padding: "12px 24px", borderRadius: 14,
                border: `1px solid ${T.borderLight}`,
                background: "transparent", color: T.textMuted,
                cursor: "pointer", fontFamily: T.font,
                fontWeight: 600, fontSize: 14,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.bgHover; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; }}
            >
              Anterior
            </button>
          )}
          <button
            onClick={handleNext}
            style={{
              padding: "12px 32px", borderRadius: 14, border: "none",
              background: `linear-gradient(135deg, ${step.color} 0%, ${step.color}b0 100%)`,
              color: "#020617", cursor: "pointer",
              fontFamily: T.font, fontWeight: 700, fontSize: 14,
              boxShadow: `0 4px 20px ${step.color}35, inset 0 1px 0 rgba(255,255,255,0.2)`,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 8px 28px ${step.color}45, inset 0 1px 0 rgba(255,255,255,0.2)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 20px ${step.color}35, inset 0 1px 0 rgba(255,255,255,0.2)`; }}
          >
            {currentStep === steps.length - 1 ? "Empezar →" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}
