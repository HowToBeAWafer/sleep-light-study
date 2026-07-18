"use client";

import { type FormEvent, useId, useState } from "react";
import { type Language } from "./i18n";

export const SESSION_FEEDBACK_PROMPT_VERSION = "feedback-question-v1" as const;

export type SessionFeedbackMessageType = "feedback" | "question";

/**
 * Versioned input for one append-only participant feedback entry. The database
 * supplies its own immutable ID and creation time when this payload is saved.
 */
export type SessionFeedbackPayload = {
  messageType: SessionFeedbackMessageType;
  message: string;
  language: Language;
  promptVersion: typeof SESSION_FEEDBACK_PROMPT_VERSION;
};

export type SessionFeedbackProps = {
  language?: Language;
  disabled?: boolean;
  saving?: boolean;
  submitted?: boolean;
  testMode?: boolean;
  onSubmit: (payload: SessionFeedbackPayload) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
};

const COPY = {
  en: {
    title: "Questions or feedback?",
    introduction: "Questions, feedback, and brief notes about unusual or technical events are welcome.",
    privacy: "Do not include private medical details or the names of medications or supplements.",
    testMode: "Test mode: this message will not be saved.",
    typeLabel: "Message type",
    feedback: "Feedback",
    question: "Question",
    messageLabel: "Your message",
    placeholder: "Write your question or feedback",
    characterCount: (count: number) => `${count} / 4000 characters`,
    required: "Enter a message before submitting.",
    saveFailed: "The message could not be submitted. Please try again or skip this step.",
    submit: "Submit",
    saving: "Submitting…",
    skip: "Skip",
    submitted: "Thank you. Your message has been recorded.",
    submittedTest: "Test complete. This message was not saved.",
  },
  zh: {
    title: "有问题或反馈吗？",
    introduction: "欢迎提出问题、提供反馈，或简要说明异常情况和技术问题。",
    privacy: "请不要填写私人医疗信息，也不要填写药物或保健品的具体名称。",
    testMode: "测试模式：此消息不会被保存。",
    typeLabel: "消息类型",
    feedback: "反馈",
    question: "问题",
    messageLabel: "你的消息",
    placeholder: "请填写问题或反馈",
    characterCount: (count: number) => `${count} / 4000 字符`,
    required: "请先填写消息再提交。",
    saveFailed: "消息未能提交。请重试，或跳过此步骤。",
    submit: "提交",
    saving: "正在提交…",
    skip: "跳过",
    submitted: "谢谢，你的消息已记录。",
    submittedTest: "测试已完成，此消息未被保存。",
  },
} as const;

export function SessionFeedback({
  language = "en",
  disabled = false,
  saving = false,
  submitted = false,
  testMode = false,
  onSubmit,
  onSkip,
}: SessionFeedbackProps) {
  const uniqueId = useId();
  const [messageType, setMessageType] = useState<SessionFeedbackMessageType>("feedback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);
  const [error, setError] = useState<"required" | "save-failed" | null>(null);
  const copy = COPY[language];
  const isSubmitted = submitted || locallySubmitted;
  const controlsDisabled = disabled || saving || busy || isSubmitted;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controlsDisabled) return;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        messageType,
        message: trimmedMessage,
        language,
        promptVersion: SESSION_FEEDBACK_PROMPT_VERSION,
      });
      setLocallySubmitted(true);
    } catch {
      setError("save-failed");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (controlsDisabled) return;
    setError(null);
    setBusy(true);
    try {
      await onSkip();
    } catch {
      setError("save-failed");
    } finally {
      setBusy(false);
    }
  };

  if (isSubmitted) {
    return (
      <section className="feedback-panel" aria-live="polite">
        <h2>{testMode ? copy.submittedTest : copy.submitted}</h2>
      </section>
    );
  }

  return (
    <form className="feedback-panel" onSubmit={submit} aria-busy={saving || busy}>
      <h2>{copy.title}</h2>
      <p>{copy.introduction}</p>
      <p className="survey-privacy-note">{copy.privacy}</p>
      {testMode ? <p className="feedback-status" role="status">{copy.testMode}</p> : null}

      <div className="feedback-grid">
        <label htmlFor={`${uniqueId}-type`}>
          <span>{copy.typeLabel}</span>
          <select
            id={`${uniqueId}-type`}
            value={messageType}
            disabled={controlsDisabled}
            onChange={(event) => setMessageType(event.target.value as SessionFeedbackMessageType)}
          >
            <option value="feedback">{copy.feedback}</option>
            <option value="question">{copy.question}</option>
          </select>
        </label>
      </div>

      <label className="feedback-message-field" htmlFor={`${uniqueId}-message`}>
        <span>{copy.messageLabel}</span>
        <textarea
          id={`${uniqueId}-message`}
          value={message}
          maxLength={4000}
          rows={5}
          placeholder={copy.placeholder}
          disabled={controlsDisabled}
          required
          aria-describedby={`${uniqueId}-message-count`}
          onChange={(event) => setMessage(event.target.value)}
        />
        <small id={`${uniqueId}-message-count`} className="feedback-status" aria-live="polite">
          {copy.characterCount(message.length)}
        </small>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error === "required" ? copy.required : copy.saveFailed}
        </p>
      ) : null}

      <div className="feedback-actions">
        <button className="primary-button" type="submit" disabled={controlsDisabled}>
          {saving || busy ? copy.saving : copy.submit}
        </button>
        <button className="secondary-button" type="button" disabled={controlsDisabled} onClick={skip}>
          {copy.skip}
        </button>
      </div>
    </form>
  );
}
