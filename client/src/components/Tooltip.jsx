import React, { useState } from "react";
import { T } from "../theme";

export default function Tooltip({ children, content, position = "top", width = 220 }) {
  const [visible, setVisible] = useState(false);

  const posStyles = {
    top: { bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-8px)", marginBottom: 8 },
    bottom: { top: "100%", left: "50%", transform: "translateX(-50%) translateY(8px)", marginTop: 8 },
    left: { right: "100%", top: "50%", transform: "translateY(-50%) translateX(-8px)", marginRight: 8 },
    right: { left: "100%", top: "50%", transform: "translateY(-50%) translateX(8px)", marginLeft: 8 },
  };

  const arrowStyles = {
    top: { bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", borderTop: "none", borderLeft: "none" },
    bottom: { top: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", borderBottom: "none", borderRight: "none" },
    left: { right: -4, top: "50%", transform: "translateY(-50%) rotate(45deg)", borderLeft: "none", borderTop: "none" },
    right: { left: -4, top: "50%", transform: "translateY(-50%) rotate(45deg)", borderRight: "none", borderBottom: "none" },
  };

  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span style={{
          position: "absolute",
          ...posStyles[position],
          width,
          background: "rgba(14, 18, 32, 0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${T.borderLight}`,
          borderRadius: 12,
          padding: "12px 16px",
          fontSize: 12,
          color: T.textMuted,
          lineHeight: 1.6,
          zIndex: 1000,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "fadeIn 0.2s ease",
          pointerEvents: "none",
          textAlign: "left",
          fontFamily: T.font,
        }}>
          <span style={{
            position: "absolute",
            width: 8,
            height: 8,
            background: "rgba(14, 18, 32, 0.95)",
            border: `1px solid ${T.borderLight}`,
            ...arrowStyles[position],
          }} />
          {content}
        </span>
      )}
    </span>
  );
}

export function InfoBadge({ text, tooltip, color = T.textDim }) {
  return (
    <Tooltip content={tooltip}>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: `1px solid ${color}40`,
        color,
        fontSize: 10,
        fontWeight: 800,
        fontFamily: T.fontMono,
        marginLeft: 6,
        cursor: "help",
      }}>
        {text || "i"}
      </span>
    </Tooltip>
  );
}
