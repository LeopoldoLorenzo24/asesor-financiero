import React, { useState, useEffect } from "react";
import { T, S } from "../theme";

const steps = [
  {
    id: "welcome",
    title: "Bienvenido a CEDEAR Advisor",
    subtitle: "Tu motor de inversion con IA",
    description: "Este sistema te ayuda a invertir en CEDEARs con una estrategia profesional Core/Satellite, gobernanza de capital y evidencia real.",
    icon: "◆",
    color: T.green,
  },
  {
    id: "philosophy",
    title: "Filosofia Core/Satellite",
    subtitle: "SPY es el default",
    description: "El sistema siempre prefiere ETFs (SPY/QQQ) como core. Solo recomienda picks individuales cuando hay conviccion REAL de que le ganan al mercado. Si no hay picks claros: 100% core.",
    icon: "◎",
    color: T.blue,
  },
  {
    id: "governance",
    title: "Gobernanza de Capital",
    subtitle: "No operamos a ciegas",
    description: "El sistema NO te deja poner capital real hasta que demuestre edge estadistico: 90 dias de track record, Sharpe >= 1.0, drawdown < 15%, y win rate > 60% vs SPY.",
    icon: "●",
    color: T.cyan,
  },
  {
    id: "paper",
    title: "Paper Trading Realista",
    subtitle: "Simulacion con costos reales",
    description: "Antes de capital real, todo pasa por paper trading con: comisiones de broker argentino, lotes BYMA, slippage por liquidez, partial fills, y dividendos netos de impuestos.",
    icon: "◇",
    color: T.purple,
  },
  {
    id: "analysis",
    title: "Analisis Mensual con IA",
    subtitle: "Claude + datos reales",
    description: "Una vez al mes el sistema analiza ~226 CEDEARs, corre backtests, verifica consistencia numerica, aplica limites de riesgo y genera un plan ejecutable. Cooldown de 1 hora entre analisis.",
    icon: "◈",
    color: T.pink,
  },
  {
    id: "track",
    title: "Track Record & Evidencia",
    subtitle: "Datos no opiniones",
    description: "Cada dia el sistema guarda: valor virtual, valor real, benchmark SPY, alpha, drawdown, Sharpe. Todo exportable a CSV. La evidencia decide si se permite capital real.",
    icon: "◉",
    color: T.gold,
  },
  {
    id: "security",
    title: "Seguridad",
    subtitle: "2FA para capital real",
    description: "Operar con capital real requiere autenticacion de dos factores (TOTP). El sistema tambien tiene circuit breakers macro: si el CCL explota o hay crisis cambiaria, se congela automaticamente.",
    icon: "◐",
    color: T.red,
  },
  {
    id: "ready",
    title: "Estas listo",
    subtitle: "Empeza con paper trading",
    description: "Corre tu primer analisis de IA, sincroniza el portfolio virtual, y deja que el sistema acumule evidencia. Cuando los numeros lo justifiquen, el readiness te habilitara capital real incremental.",
    icon: "◆",
    color: T.green,
  },
];

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    } else {
      localStorage.setItem("cedear_onboarding_seen", "true");
      setIsVisible(false);
      setTimeout(onComplete, 500);
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
    setTimeout(onComplete, 500);
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: `linear-gradient(135deg, ${T.bg} 0%, #0a0f1e 50%, ${T.bg} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.5s ease",
        overflow: "auto",
      }}
    >
      {/* Background effects */}
      <div style={{
        position: "absolute",
        top: "10%",
        left: "10%",
        width: 400,
        height: 400,
        background: `radial-gradient(circle, ${step.color}08 0%, transparent 70%)`,
        borderRadius: "50%",
        filter: "blur(60px)",
        animation: "float 6s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute",
        bottom: "10%",
        right: "10%",
        width: 300,
        height: 300,
        background: `radial-gradient(circle, ${T.blue}06 0%, transparent 70%)`,
        borderRadius: "50%",
        filter: "blur(60px)",
        animation: "float 8s ease-in-out infinite reverse",
      }} />

      <div style={{ width: "100%", maxWidth: 640, padding: "40px 24px", position: "relative", zIndex: 2 }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", fontWeight: 700 }}>
              Paso {currentStep + 1} de {steps.length}
            </span>
            <button onClick={handleSkip} style={{ background: "none", border: "none", color: T.textDim, fontSize: 12, cursor: "pointer", fontFamily: T.font, fontWeight: 600 }}>
              Saltar tour
            </button>
          </div>
          <div style={{ height: 3, background: "rgba(148,163,184,0.08)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${step.color}, ${T.cyan})`,
              borderRadius: 3,
              transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: `0 0 12px ${step.color}40`,
            }} />
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setDirection(i > currentStep ? 1 : -1); setCurrentStep(i); }}
              style={{
                width: i === currentStep ? 32 : 8,
                height: 8,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                background: i === currentStep ? step.color : i < currentStep ? `${step.color}40` : "rgba(148,163,184,0.15)",
                boxShadow: i === currentStep ? `0 0 12px ${step.color}60` : "none",
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          key={step.id}
          style={{
            ...S.card,
            background: "rgba(14, 18, 32, 0.8)",
            borderColor: `${step.color}20`,
            padding: 48,
            textAlign: "center",
            animation: direction > 0 ? "fadeUp 0.5s ease" : "fadeUp 0.5s ease reverse",
          }}
        >
          {/* Icon */}
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${step.color}, ${step.color}60)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            margin: "0 auto 28px",
            boxShadow: `0 12px 40px ${step.color}30`,
            animation: "float 3s ease-in-out infinite",
          }}>
            {step.icon}
          </div>

          <div style={{
            fontSize: 10,
            color: step.color,
            fontFamily: T.fontMono,
            textTransform: "uppercase",
            letterSpacing: "3px",
            fontWeight: 800,
            marginBottom: 12,
          }}>
            {step.subtitle}
          </div>

          <h2 style={{
            fontSize: 28,
            fontWeight: 800,
            color: T.text,
            margin: "0 0 16px",
            letterSpacing: "-0.5px",
            lineHeight: 1.2,
          }}>
            {step.title}
          </h2>

          <p style={{
            fontSize: 14,
            color: T.textMuted,
            lineHeight: 1.8,
            margin: 0,
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            {step.description}
          </p>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 32 }}>
          {currentStep > 0 && (
            <button
              onClick={handlePrev}
              style={{
                ...S.btn("ghost"),
                padding: "12px 24px",
              }}
            >
              Anterior
            </button>
          )}
          <button
            onClick={handleNext}
            style={{
              ...S.btn("primary"),
              padding: "12px 32px",
              background: `linear-gradient(135deg, ${step.color}, ${step.color}80)`,
              boxShadow: `0 4px 24px ${step.color}40`,
            }}
          >
            {currentStep === steps.length - 1 ? "Empezar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
