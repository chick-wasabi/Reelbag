"use client";
import { useId } from "react";
import PasswordField from "./PasswordField";
export const QUESTIONS = [
  "What was the name of your first dream bike/car?",
  "What was the first video game that blew your mind?",
  "Where is your ultimate dream road trip destination?",
];
export default function RecoveryFields({
  question,
  setQuestion,
  customQuestion,
  setCustomQuestion,
  answer,
  setAnswer,
  disabled,
}) {
  const id = useId();
  return (
    <div className="form-stack recovery-fields">
      <div>
        <label className="field-label" htmlFor={id}>
          Security question
        </label>
        <select
          id={id}
          className="mt-2"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={disabled}
        >
          {QUESTIONS.map((q) => (
            <option key={q}>{q}</option>
          ))}
          <option value="custom">Write my own question</option>
        </select>
      </div>
      {question === "custom" && (
        <label className="field-label">
          Custom question
          <input
            required
            maxLength={200}
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            disabled={disabled}
            placeholder="Something only you would know"
          />
        </label>
      )}
      <PasswordField
        label="Recovery answer"
        minLength={4}
        maxLength={200}
        autoComplete="off"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={disabled}
      />
      <p className="fine-print !mt-0">
        Choose a private answer, not a public fact. Use 4–64 letters or numbers
        after normalization. Punctuation and case are ignored; answers with at
        least 6 characters tolerate one spelling edit. This flexibility makes
        answers easier to guess.
      </p>
    </div>
  );
}
