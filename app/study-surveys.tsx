"use client";

import { type FormEvent, useState } from "react";
import { COMMON_COPY, localize, type Language } from "./i18n";
import {
  DEVICE_CATEGORIES,
  KSS_OPTIONS,
  POST_STUDY_QUESTIONNAIRE_VERSION,
  confirmDeviceCategory,
  createDefaultPreStudySurvey,
  isPreStudySurvey,
  type DeviceCategory,
  type DeviceInfo,
  type FivePointScore,
  type KssScore,
  type PostStudySurvey,
  type PreStudySurvey,
  type PreStudySurveyDraft,
  type SleepLightColor,
  type SleepNoiseLevel,
  type SleepTemperature,
  type YesNoPreferNotToAnswer,
} from "./protocol-v3";

const KSS_LABELS_ZH: Record<KssScore, string> = {
  1: "极度清醒",
  2: "非常清醒",
  3: "清醒",
  4: "比较清醒",
  5: "既不清醒也不困倦",
  6: "有些困倦的迹象",
  7: "困倦，但无需努力保持清醒",
  8: "困倦，需要一些努力保持清醒",
  9: "非常困倦，需要非常努力保持清醒，正在与睡意抗争",
};

const PRE_SURVEY_COPY = {
  en: {
    eyebrow: "Before tonight's condition",
    title: "Sleep and environment questionnaire",
    introduction: "Please answer for your most recent sleep or for tonight where the question specifies it.",
    deviceQuestion: "What type of device are you using for this study?",
    detectedDevice: "Automatically detected: {device}. Correct it if needed.",
    previousSleepTime: "What time did you try to fall asleep for your most recent sleep?",
    sleepiness: "How sleepy have you felt during the immediately preceding five minutes?",
    screenUse: "During the two hours before this session, did you use a screen-based electronic device?",
    screenMinutes: "Approximately how many minutes?",
    sleepLight: "Do you plan to sleep with a light on tonight?",
    sleepLightColor: "What color will the sleep-environment light be?",
    sleepTemperature: "What temperature will your sleep environment feel like?",
    sleepAid: "Will you take any sleep-aid medication or supplement tonight?",
    restedness: "How rested or refreshed did you feel when you woke from your most recent sleep?",
    sleepQuality: "How would you rate the quality of your most recent sleep?",
    caffeine: "Have you consumed caffeine during the past eight hours?",
    music: "Do you plan to play music while falling asleep tonight?",
    noise: "How much noise is normally present in tonight's sleep environment?",
    exercise: "Have you performed vigorous exercise during the past 12 hours?",
    incomplete: "Please answer every question before continuing.",
    continue: "Continue to tonight's condition",
    privacy: "Responses are stored with your study name. Do not enter medication or supplement names.",
  },
  zh: {
    eyebrow: "今晚的实验开始前",
    title: "睡眠与环境问卷",
    introduction: "请根据你最近一次睡眠作答；问题明确提到“今晚”时，请根据今晚的情况作答。",
    deviceQuestion: "你正在使用哪一类设备参加本研究？",
    detectedDevice: "系统自动识别为：{device}。如果不正确，请修改。",
    previousSleepTime: "你最近一次睡眠大约几点开始尝试入睡？",
    sleepiness: "在刚刚过去的五分钟内，你感觉有多困？",
    screenUse: "本次实验前的两小时内，你是否使用过带屏幕的电子设备？",
    screenMinutes: "大约使用了多少分钟？",
    sleepLight: "今晚睡觉时你是否打算开灯？",
    sleepLightColor: "睡眠环境中的灯是什么颜色？",
    sleepTemperature: "你今晚的睡眠环境体感温度如何？",
    sleepAid: "今晚你是否会服用任何助眠药物或保健品？",
    restedness: "最近一次睡醒时，你感觉休息得有多充分或精神恢复得如何？",
    sleepQuality: "你如何评价最近一次睡眠的质量？",
    caffeine: "过去八小时内，你是否摄入过咖啡因？",
    music: "今晚入睡时你是否打算播放音乐？",
    noise: "今晚的睡眠环境通常有多少噪音？",
    exercise: "过去12小时内，你是否进行过剧烈运动？",
    incomplete: "请回答所有问题后再继续。",
    continue: "继续今晚的实验条件",
    privacy: "回答会与你的实验名称关联保存。请不要填写药物或保健品的具体名称。",
  },
} as const;

const POST_SURVEY_COPY = {
  en: {
    eyebrow: "After waking",
    title: "How sleepy are you now?",
    introduction: "Answer before reading the reaction-test instructions.",
    deviceQuestion: "What type of device are you using now?",
    detectedDevice: "Automatically detected: {device}. Correct it if needed.",
    sleepiness: "How sleepy have you felt during the immediately preceding five minutes?",
    continue: "Continue to reaction test",
  },
  zh: {
    eyebrow: "睡醒后",
    title: "你现在有多困？",
    introduction: "请先作答，再阅读反应力测试说明。",
    deviceQuestion: "你现在使用的是哪一类设备？",
    detectedDevice: "系统自动识别为：{device}。如果不正确，请修改。",
    sleepiness: "在刚刚过去的五分钟内，你感觉有多困？",
    continue: "继续进行反应力测试",
  },
} as const;

function yesNoPreferOptions(language: Language) {
  return [
    { value: "yes", label: localize(language, COMMON_COPY.yes) },
    { value: "no", label: localize(language, COMMON_COPY.no) },
    {
      value: "prefer-not-to-answer",
      label: localize(language, COMMON_COPY.preferNotToAnswer),
    },
  ];
}

function deviceLabel(device: DeviceCategory, language: Language) {
  return localize(language, COMMON_COPY[device]);
}

function deviceOptions(language: Language) {
  return DEVICE_CATEGORIES.map((value) => ({ value, label: deviceLabel(value, language) }));
}

function KssField({
  value,
  onChange,
  legend,
  language,
}: {
  value: KssScore | null;
  onChange: (value: KssScore) => void;
  legend: string;
  language: Language;
}) {
  return (
    <fieldset className="survey-question kss-question">
      <legend>{legend}</legend>
      <p className="question-help">
        {language === "zh"
          ? "卡罗林斯卡困倦量表（KSS），标准1–9分完整文字标注版。"
          : "Karolinska Sleepiness Scale (KSS), standard 1–9 fully labelled version."}
      </p>
      <div className="kss-options">
        {KSS_OPTIONS.map((option) => (
          <label key={option.value} className={value === option.value ? "selected" : ""}>
            <input
              type="radio"
              name={legend}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              required
            />
            <strong>{option.value}</strong>
            <span>{language === "zh" ? KSS_LABELS_ZH[option.value] : option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SelectQuestion({
  id,
  label,
  value,
  onChange,
  options,
  help,
  language,
}: {
  id: string;
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  help?: string;
  language: Language;
}) {
  return (
    <label className="survey-question" htmlFor={id}>
      <span>{label}</span>
      {help ? <small>{help}</small> : null}
      <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required>
        <option value="" disabled>{localize(language, COMMON_COPY.selectOne)}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function PreStudySurveyForm({
  detectedDevice,
  language = "en",
  onSubmit,
}: {
  detectedDevice: DeviceInfo;
  language?: Language;
  onSubmit: (survey: PreStudySurvey, deviceInfo: DeviceInfo) => void;
}) {
  const [answers, setAnswers] = useState<PreStudySurveyDraft>(createDefaultPreStudySurvey);
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory>(detectedDevice.confirmedCategory);
  const [error, setError] = useState("");
  const copy = PRE_SURVEY_COPY[language];
  const commonAnswers = yesNoPreferOptions(language);

  const update = <Key extends keyof PreStudySurveyDraft>(
    key: Key,
    value: PreStudySurveyDraft[Key],
  ) => setAnswers((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const completed: PreStudySurvey = {
      ...answers,
      answeredAtIso: new Date().toISOString(),
      previousNightSleepTime: answers.previousNightSleepTime ?? "",
      sleepinessKss: answers.sleepinessKss as KssScore,
      screenUseBeforeSleep: answers.screenUseBeforeSleep as YesNoPreferNotToAnswer,
      screenUseMinutes:
        answers.screenUseBeforeSleep === "yes"
          ? answers.screenUseMinutes
          : answers.screenUseBeforeSleep === "no"
            ? 0
            : null,
      sleepsWithLight: answers.sleepsWithLight as YesNoPreferNotToAnswer,
      sleepLightColor: answers.sleepsWithLight === "yes" ? answers.sleepLightColor : null,
      sleepTemperature: answers.sleepTemperature as SleepTemperature,
      sleepAidMedicationOrSupplement:
        answers.sleepAidMedicationOrSupplement as YesNoPreferNotToAnswer,
      morningRestedness: answers.morningRestedness as FivePointScore,
      previousNightSleepQuality: answers.previousNightSleepQuality as FivePointScore,
      caffeineInPast8Hours: answers.caffeineInPast8Hours as YesNoPreferNotToAnswer,
      musicBeforeSleep: answers.musicBeforeSleep as YesNoPreferNotToAnswer,
      sleepNoiseLevel: answers.sleepNoiseLevel as SleepNoiseLevel,
      vigorousExerciseInPast12Hours:
        answers.vigorousExerciseInPast12Hours as YesNoPreferNotToAnswer,
    };
    if (!isPreStudySurvey(completed)) {
      setError(copy.incomplete);
      return;
    }
    setError("");
    onSubmit(completed, confirmDeviceCategory(detectedDevice, deviceCategory));
  };

  return (
    <main className="survey-shell">
      <form className="survey-card" onSubmit={submit}>
        <header className="survey-header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.introduction}</p>
        </header>

        <SelectQuestion
          id="device-category"
          label={copy.deviceQuestion}
          help={copy.detectedDevice.replace("{device}", deviceLabel(detectedDevice.detectedCategory, language))}
          value={deviceCategory}
          onChange={(value) => setDeviceCategory(value as DeviceCategory)}
          options={deviceOptions(language)}
          language={language}
        />

        <label className="survey-question" htmlFor="previous-sleep-time">
          <span>{copy.previousSleepTime}</span>
          <input
            id="previous-sleep-time"
            type="time"
            value={answers.previousNightSleepTime ?? ""}
            onChange={(event) => update("previousNightSleepTime", event.target.value)}
            required
          />
        </label>

        <KssField
          value={answers.sleepinessKss}
          onChange={(value) => update("sleepinessKss", value)}
          legend={copy.sleepiness}
          language={language}
        />

        <SelectQuestion
          id="screen-use"
          label={copy.screenUse}
          value={answers.screenUseBeforeSleep}
          onChange={(value) => {
            update("screenUseBeforeSleep", value as YesNoPreferNotToAnswer);
            if (value !== "yes") update("screenUseMinutes", value === "no" ? 0 : null);
          }}
          options={commonAnswers}
          language={language}
        />
        {answers.screenUseBeforeSleep === "yes" ? (
          <label className="survey-question nested-question" htmlFor="screen-minutes">
            <span>{copy.screenMinutes}</span>
            <input
              id="screen-minutes"
              type="number"
              min="1"
              max="120"
              step="1"
              value={answers.screenUseMinutes ?? ""}
              onChange={(event) => update("screenUseMinutes", event.target.value ? Number(event.target.value) : null)}
              required
            />
          </label>
        ) : null}

        <SelectQuestion
          id="sleep-light"
          label={copy.sleepLight}
          value={answers.sleepsWithLight}
          onChange={(value) => {
            update("sleepsWithLight", value as YesNoPreferNotToAnswer);
            if (value !== "yes") update("sleepLightColor", null);
          }}
          options={commonAnswers}
          language={language}
        />
        {answers.sleepsWithLight === "yes" ? (
          <SelectQuestion
            id="sleep-light-color"
            label={copy.sleepLightColor}
            value={answers.sleepLightColor}
            onChange={(value) => update("sleepLightColor", value as SleepLightColor)}
            options={language === "zh" ? [
              { value: "warm-white-yellow", label: "暖白色／黄色" },
              { value: "cool-white", label: "冷白色" },
              { value: "red", label: "红色" },
              { value: "blue", label: "蓝色" },
              { value: "green", label: "绿色" },
              { value: "multicolor", label: "多种颜色" },
              { value: "other", label: "其他" },
              { value: "unsure", label: "不确定" },
            ] : [
              { value: "warm-white-yellow", label: "Warm white / yellow" },
              { value: "cool-white", label: "Cool white" },
              { value: "red", label: "Red" },
              { value: "blue", label: "Blue" },
              { value: "green", label: "Green" },
              { value: "multicolor", label: "Multicolor" },
              { value: "other", label: "Other" },
              { value: "unsure", label: "Unsure" },
            ]}
            language={language}
          />
        ) : null}

        <SelectQuestion
          id="sleep-temperature"
          label={copy.sleepTemperature}
          value={answers.sleepTemperature}
          onChange={(value) => update("sleepTemperature", value as SleepTemperature)}
          options={language === "zh" ? [
            { value: "cold", label: "冷" },
            { value: "slightly-cold", label: "稍冷" },
            { value: "comfortable", label: "舒适" },
            { value: "slightly-warm", label: "稍热" },
            { value: "hot", label: "热" },
            { value: "prefer-not-to-answer", label: "不愿回答" },
          ] : [
            { value: "cold", label: "Cold" },
            { value: "slightly-cold", label: "Slightly cold" },
            { value: "comfortable", label: "Comfortable" },
            { value: "slightly-warm", label: "Slightly warm" },
            { value: "hot", label: "Hot" },
            { value: "prefer-not-to-answer", label: "Prefer not to answer" },
          ]}
          language={language}
        />

        <SelectQuestion
          id="sleep-aid"
          label={copy.sleepAid}
          value={answers.sleepAidMedicationOrSupplement}
          onChange={(value) => update("sleepAidMedicationOrSupplement", value as YesNoPreferNotToAnswer)}
          options={commonAnswers}
          language={language}
        />

        <SelectQuestion
          id="morning-restedness"
          label={copy.restedness}
          value={answers.morningRestedness}
          onChange={(value) => update("morningRestedness", Number(value) as FivePointScore)}
          options={language === "zh" ? [
            { value: "1", label: "1 — 完全没有休息好" },
            { value: "2", label: "2 — 稍微休息了一些" },
            { value: "3", label: "3 — 休息程度一般" },
            { value: "4", label: "4 — 休息得很好" },
            { value: "5", label: "5 — 休息得非常充分" },
          ] : [
            { value: "1", label: "1 — Not at all rested" },
            { value: "2", label: "2 — Slightly rested" },
            { value: "3", label: "3 — Moderately rested" },
            { value: "4", label: "4 — Well rested" },
            { value: "5", label: "5 — Very well rested" },
          ]}
          language={language}
        />

        <SelectQuestion
          id="sleep-quality"
          label={copy.sleepQuality}
          value={answers.previousNightSleepQuality}
          onChange={(value) => update("previousNightSleepQuality", Number(value) as FivePointScore)}
          options={language === "zh" ? [
            { value: "1", label: "1 — 非常差" },
            { value: "2", label: "2 — 差" },
            { value: "3", label: "3 — 一般" },
            { value: "4", label: "4 — 好" },
            { value: "5", label: "5 — 非常好" },
          ] : [
            { value: "1", label: "1 — Very poor" },
            { value: "2", label: "2 — Poor" },
            { value: "3", label: "3 — Fair" },
            { value: "4", label: "4 — Good" },
            { value: "5", label: "5 — Very good" },
          ]}
          language={language}
        />

        <SelectQuestion
          id="caffeine"
          label={copy.caffeine}
          value={answers.caffeineInPast8Hours}
          onChange={(value) => update("caffeineInPast8Hours", value as YesNoPreferNotToAnswer)}
          options={commonAnswers}
          language={language}
        />
        <SelectQuestion
          id="sleep-music"
          label={copy.music}
          value={answers.musicBeforeSleep}
          onChange={(value) => update("musicBeforeSleep", value as YesNoPreferNotToAnswer)}
          options={commonAnswers}
          language={language}
        />
        <SelectQuestion
          id="sleep-noise"
          label={copy.noise}
          value={answers.sleepNoiseLevel}
          onChange={(value) => update("sleepNoiseLevel", value as SleepNoiseLevel)}
          options={language === "zh" ? [
            { value: "none", label: "无噪音／安静" },
            { value: "low", label: "较低" },
            { value: "moderate", label: "中等" },
            { value: "high", label: "较高" },
            { value: "prefer-not-to-answer", label: "不愿回答" },
          ] : [
            { value: "none", label: "None / quiet" },
            { value: "low", label: "Low" },
            { value: "moderate", label: "Moderate" },
            { value: "high", label: "High" },
            { value: "prefer-not-to-answer", label: "Prefer not to answer" },
          ]}
          language={language}
        />
        <SelectQuestion
          id="vigorous-exercise"
          label={copy.exercise}
          value={answers.vigorousExerciseInPast12Hours}
          onChange={(value) => update("vigorousExerciseInPast12Hours", value as YesNoPreferNotToAnswer)}
          options={commonAnswers}
          language={language}
        />

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button survey-submit" type="submit">{copy.continue}</button>
        <p className="survey-privacy-note">{copy.privacy}</p>
      </form>
    </main>
  );
}

export function PostStudySurveyForm({
  detectedDevice,
  language = "en",
  saveError = "",
  onSubmit,
}: {
  detectedDevice: DeviceInfo;
  language?: Language;
  saveError?: string;
  onSubmit: (survey: PostStudySurvey, deviceInfo: DeviceInfo) => void;
}) {
  const [sleepinessKss, setSleepinessKss] = useState<KssScore | null>(null);
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory>(detectedDevice.confirmedCategory);
  const copy = POST_SURVEY_COPY[language];
  return (
    <main className="survey-shell post-survey-shell">
      <form
        className="survey-card post-survey-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (sleepinessKss === null) return;
          onSubmit(
            {
              questionnaireVersion: POST_STUDY_QUESTIONNAIRE_VERSION,
              answeredAtIso: new Date().toISOString(),
              sleepinessKss,
            },
            confirmDeviceCategory(detectedDevice, deviceCategory),
          );
        }}
      >
        <header className="survey-header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.introduction}</p>
        </header>
        <SelectQuestion
          id="post-device-category"
          label={copy.deviceQuestion}
          help={copy.detectedDevice.replace("{device}", deviceLabel(detectedDevice.detectedCategory, language))}
          value={deviceCategory}
          onChange={(value) => setDeviceCategory(value as DeviceCategory)}
          options={deviceOptions(language)}
          language={language}
        />
        <KssField
          value={sleepinessKss}
          onChange={setSleepinessKss}
          legend={copy.sleepiness}
          language={language}
        />
        {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
        <button className="primary-button survey-submit" type="submit" disabled={sleepinessKss === null}>
          {copy.continue}
        </button>
      </form>
    </main>
  );
}
