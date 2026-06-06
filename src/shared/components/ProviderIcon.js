"use client";

import { useState } from "react";
import PropTypes from "prop-types";

export default function ProviderIcon({
  src,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const [errored, setErrored] = useState(false);

  let resolvedSrc = src;
  if (typeof src === "string" && src.startsWith("/providers/")) {
    const filename = src.replace("/providers/", "");
    if (filename.startsWith("openai-compatible-")) {
      resolvedSrc = filename.includes("-responses")
        ? "/providers/oai-r.png"
        : "/providers/oai-cc.png";
    } else if (filename.startsWith("anthropic-compatible-")) {
      resolvedSrc = "/providers/anthropic-m.png";
    } else if (filename.startsWith("custom-embedding-")) {
      resolvedSrc = "/providers/oai-cc.png";
    }
  }

  if (!resolvedSrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
