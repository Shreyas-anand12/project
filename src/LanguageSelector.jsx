import React from "react";

export default function LanguageSelector({
  languages,
  currentLanguage,
  onSelect,
  onClose,
  allowClose
}) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={allowClose ? onClose : undefined}
    >
      <div
        className="modal-card language-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h3 id="language-modal-title">Choose your language / अपनी भाषा चुनें</h3>
          {allowClose && (
            <button className="modal-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        <p className="language-modal-subtitle">
          Select the language you'd like to use RescueGrid in.
        </p>

        <div className="language-grid">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`language-option ${
                lang.code === currentLanguage ? "is-selected" : ""
              }`}
              onClick={() => onSelect(lang.code)}
            >
              <span className="language-native">{lang.nativeName}</span>
              <span className="language-english">{lang.englishName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}