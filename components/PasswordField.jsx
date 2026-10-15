"use client";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export default function PasswordField({
  label,
  value,
  onChange,
  disabled = false,
  autoComplete = "current-password",
  minLength = 8,
  maxLength = 72,
  placeholder,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          id={id}
          required
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
