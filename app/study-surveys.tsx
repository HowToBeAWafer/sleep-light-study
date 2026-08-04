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
import {
  MORNING_QUESTIONNAIRE_VERSION,
  POST_EXPOSURE_QUESTIONNAIRE_VERSION,
  isMorningStudySurvey,
  type MorningStudySurvey,
  type PostExposureSurvey,
} from "./protocol-v4";

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
    eyebrow: "本次实验开始前",
    title: "睡眠与环境问卷",
    introduction: "请根据最近一次睡眠情况作答；若题目提及“今晚”，请按今晚的实际情况回答。",
    deviceQuestion: "本次实验使用的设备类型是？",
    detectedDevice: "系统识别的设备类型为：{device}。如有误，请修改。",
    previousSleepTime: "最近一次睡眠中，你大约从几点开始尝试入睡？",
    sleepiness: "过去五分钟内，你的困倦程度如何？",
    screenUse: "本次实验前两小时内，你是否使用过带屏幕的电子设备？",
    screenMinutes: "累计大约使用了多少分钟？",
    sleepLight: "你今晚睡觉时是否计划开灯？",
    sleepLightColor: "计划开启的灯光主要是什么颜色？",
    sleepTemperature: "你预计今晚睡眠环境的体感温度如何？",
    sleepAid: "你今晚是否计划服用助眠药物或补充剂？",
    restedness: "最近一次醒来时，你觉得精力恢复得如何？",
    sleepQuality: "你如何评价最近一次睡眠的整体质量？",
    caffeine: "过去八小时内，你是否摄入咖啡因？",
    music: "你今晚入睡前是否计划播放音乐？",
    noise: "你预计今晚睡眠环境的噪声程度如何？",
    exercise: "过去十二小时内，你是否进行过剧烈运动？",
    incomplete: "请回答所有问题后再继续。",
    continue: "继续进入本次实验",
    privacy: "问卷回答将与研究用名关联保存。请勿填写具体药物或补充剂名称。",
  },
} as const;

const POST_EXPOSURE_COPY = {
  en: {
    eyebrow: "Immediately after the display",
    title: "How sleepy are you now?",
    introduction: "Answer now, before putting the device away or starting another activity.",
    sleepiness: "How sleepy have you felt during the immediately preceding five minutes?",
    continue: "Save and continue to sleep instructions",
  },
  zh: {
    eyebrow: "观看结束后立即填写",
    title: "你目前的困倦程度如何？",
    introduction: "请在放下设备或进行其他活动前立即作答。",
    sleepiness: "过去五分钟内，你的困倦程度如何？",
    continue: "保存并查看睡眠说明",
  },
} as const;

const MORNING_SURVEY_COPY = {
  en: {
    eyebrow: "Next-morning questionnaire",
    title: "Tell us about last night's sleep.",
    introduction: "Complete this questionnaire after your normal sleep. There is no separate reaction-time test.",
    deviceQuestion: "What type of device are you using now?",
    detectedDevice: "Automatically detected: {device}. Correct it if needed.",
    attemptedSleepTime: "What time did you try to fall asleep?",
    wakeTime: "What time did you wake for the day?",
    awakenings: "How many times do you remember waking during the night?",
    sleepQuality: "How would you rate last night's sleep quality?",
    restedness: "How rested or refreshed did you feel when you woke?",
    alertness: "How alert do you feel now?",
    unusualFactors: "Was anything unusual that may have affected your sleep?",
    unusualFactorsNote: "Briefly describe what was unusual. Do not include identifying or medical details.",
    continue: "Finish this session",
    incomplete: "Please answer every required question before continuing.",
  },
  zh: {
    eyebrow: "次晨问卷",
    title: "请填写昨晚的睡眠情况。",
    introduction: "请在按平常作息醒来后填写。本阶段仅需完成问卷，无需另做反应时间测试。",
    deviceQuestion: "你目前使用的设备类型是？",
    detectedDevice: "系统识别的设备类型为：{device}。如有误，请修改。",
    attemptedSleepTime: "昨晚你大约从几点开始尝试入睡？",
    wakeTime: "今天早上你大约几点醒来并开始一天的活动？",
    awakenings: "你记得昨夜睡眠期间醒来过几次？",
    sleepQuality: "你如何评价昨晚的整体睡眠质量？",
    restedness: "醒来时，你觉得精力恢复得如何？",
    alertness: "你目前的清醒程度如何？",
    unusualFactors: "昨晚是否出现任何可能影响睡眠的特殊情况？",
    unusualFactorsNote: "请简要说明特殊情况；请勿填写可识别身份的信息或具体医疗信息。",
    continue: "提交问卷并完成本次实验",
    incomplete: "请回答所有必答问题后再继续。",
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
          ? "以下为卡罗林斯卡困倦量表（Karolinska Sleepiness Scale，1–9 分）的完整选项，请选择最符合过去五分钟状态的一项。"
          : "Karolinska Sleepiness Scale, standard 1–9 fully labelled version."}
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
            { value: "prefer-not-to-answer", label: "选择不作答" },
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
            { value: "1", label: "1 — 完全没有恢复" },
            { value: "2", label: "2 — 略有恢复" },
            { value: "3", label: "3 — 恢复程度一般" },
            { value: "4", label: "4 — 恢复良好" },
            { value: "5", label: "5 — 恢复得非常充分" },
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
            { value: "none", label: "无噪声／安静" },
            { value: "low", label: "较低" },
            { value: "moderate", label: "中等" },
            { value: "high", label: "较高" },
            { value: "prefer-not-to-answer", label: "选择不作答" },
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

export function PostExposureSurveyForm({
  language = "en",
  saveError = "",
  onSubmit,
}: {
  language?: Language;
  saveError?: string;
  onSubmit: (survey: PostExposureSurvey) => void;
}) {
  const [sleepinessKss, setSleepinessKss] = useState<KssScore | null>(null);
  const copy = POST_EXPOSURE_COPY[language];
  return (
    <main className="survey-shell post-survey-shell">
      <form
        className="survey-card post-survey-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (sleepinessKss === null) return;
          onSubmit(
            {
              questionnaireVersion: POST_EXPOSURE_QUESTIONNAIRE_VERSION,
              answeredAtIso: new Date().toISOString(),
              sleepinessKss,
            },
          );
        }}
      >
        <header className="survey-header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.introduction}</p>
        </header>
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

export function MorningSurveyForm({
  detectedDevice,
  language = "en",
  saveError = "",
  onSubmit,
}: {
  detectedDevice: DeviceInfo;
  language?: Language;
  saveError?: string;
  onSubmit: (survey: MorningStudySurvey, deviceInfo: DeviceInfo) => void;
}) {
  const copy = MORNING_SURVEY_COPY[language];
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory>(detectedDevice.confirmedCategory);
  const [attemptedSleepTime, setAttemptedSleepTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [awakenings, setAwakenings] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<FivePointScore | null>(null);
  const [restedness, setRestedness] = useState<FivePointScore | null>(null);
  const [alertness, setAlertness] = useState<FivePointScore | null>(null);
  const [unusualFactors, setUnusualFactors] = useState<YesNoPreferNotToAnswer | null>(null);
  const [unusualFactorsNote, setUnusualFactorsNote] = useState("");
  const [error, setError] = useState("");
  const fivePointOptions = (labels: [string, string, string, string, string]) =>
    labels.map((label, index) => ({ value: String(index + 1), label: `${index + 1} — ${label}` }));

  return (
    <main className="survey-shell post-survey-shell">
      <form
        className="survey-card"
        onSubmit={(event) => {
          event.preventDefault();
          const completed: MorningStudySurvey = {
            questionnaireVersion: MORNING_QUESTIONNAIRE_VERSION,
            answeredAtIso: new Date().toISOString(),
            attemptedSleepTime,
            wakeTime,
            awakenings: awakenings ?? -1,
            sleepQuality: sleepQuality as FivePointScore,
            restedness: restedness as FivePointScore,
            alertness: alertness as FivePointScore,
            unusualFactors: unusualFactors as YesNoPreferNotToAnswer,
            unusualFactorsNote: unusualFactors === "yes" ? unusualFactorsNote.trim() : null,
          };
          if (!isMorningStudySurvey(completed)) {
            setError(copy.incomplete);
            return;
          }
          setError("");
          onSubmit(completed, confirmDeviceCategory(detectedDevice, deviceCategory));
        }}
      >
        <header className="survey-header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.introduction}</p>
        </header>

        <SelectQuestion
          id="morning-device-category"
          label={copy.deviceQuestion}
          help={copy.detectedDevice.replace("{device}", deviceLabel(detectedDevice.detectedCategory, language))}
          value={deviceCategory}
          onChange={(value) => setDeviceCategory(value as DeviceCategory)}
          options={deviceOptions(language)}
          language={language}
        />
        <label className="survey-question" htmlFor="attempted-sleep-time">
          <span>{copy.attemptedSleepTime}</span>
          <input id="attempted-sleep-time" type="time" value={attemptedSleepTime} onChange={(event) => setAttemptedSleepTime(event.target.value)} required />
        </label>
        <label className="survey-question" htmlFor="wake-time">
          <span>{copy.wakeTime}</span>
          <input id="wake-time" type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} required />
        </label>
        <label className="survey-question" htmlFor="night-awakenings">
          <span>{copy.awakenings}</span>
          <input id="night-awakenings" type="number" min="0" max="20" step="1" value={awakenings ?? ""} onChange={(event) => setAwakenings(event.target.value === "" ? null : Number(event.target.value))} required />
        </label>
        <SelectQuestion
          id="morning-sleep-quality"
          label={copy.sleepQuality}
          value={sleepQuality}
          onChange={(value) => setSleepQuality(Number(value) as FivePointScore)}
          options={fivePointOptions(language === "zh" ? ["非常差", "差", "一般", "好", "非常好"] : ["Very poor", "Poor", "Fair", "Good", "Very good"])}
          language={language}
        />
        <SelectQuestion
          id="morning-restedness"
          label={copy.restedness}
          value={restedness}
          onChange={(value) => setRestedness(Number(value) as FivePointScore)}
          options={fivePointOptions(language === "zh" ? ["完全没有恢复", "略有恢复", "恢复程度一般", "恢复良好", "恢复得非常充分"] : ["Not at all rested", "Slightly rested", "Moderately rested", "Well rested", "Very well rested"])}
          language={language}
        />
        <SelectQuestion
          id="morning-alertness"
          label={copy.alertness}
          value={alertness}
          onChange={(value) => setAlertness(Number(value) as FivePointScore)}
          options={fivePointOptions(language === "zh" ? ["极不清醒", "不太清醒", "清醒程度一般", "较为清醒", "非常清醒"] : ["Very unalert", "Slightly unalert", "Moderately alert", "Alert", "Very alert"])}
          language={language}
        />
        <SelectQuestion
          id="morning-unusual-factors"
          label={copy.unusualFactors}
          value={unusualFactors}
          onChange={(value) => {
            setUnusualFactors(value as YesNoPreferNotToAnswer);
            if (value !== "yes") setUnusualFactorsNote("");
          }}
          options={yesNoPreferOptions(language)}
          language={language}
        />
        {unusualFactors === "yes" ? (
          <label className="survey-question nested-question" htmlFor="morning-unusual-note">
            <span>{copy.unusualFactorsNote}</span>
            <textarea id="morning-unusual-note" value={unusualFactorsNote} onChange={(event) => setUnusualFactorsNote(event.target.value)} maxLength={1000} required />
          </label>
        ) : null}
        {error || saveError ? <p className="form-error" role="alert">{error || saveError}</p> : null}
        <button className="primary-button survey-submit" type="submit">{copy.continue}</button>
      </form>
    </main>
  );
}

/** Compatibility screen for an unexpired Protocol v3 draft started before v4 launched. */
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
          <p className="eyebrow">{language === "zh" ? "旧版 v3 醒后步骤" : "Legacy v3 after-waking step"}</p>
          <h1>{language === "zh" ? "你目前的困倦程度如何？" : "How sleepy are you now?"}</h1>
          <p>{language === "zh" ? "此页面用于恢复更新前已开始的旧版实验。" : "This restores a Protocol v3 session started before the update."}</p>
        </header>
        <SelectQuestion
          id="legacy-post-device-category"
          label={language === "zh" ? "你目前使用的设备类型是？" : "What type of device are you using now?"}
          help={(language === "zh" ? "系统识别的设备类型为：{device}。" : "Automatically detected: {device}.").replace("{device}", deviceLabel(detectedDevice.detectedCategory, language))}
          value={deviceCategory}
          onChange={(value) => setDeviceCategory(value as DeviceCategory)}
          options={deviceOptions(language)}
          language={language}
        />
        <KssField
          value={sleepinessKss}
          onChange={setSleepinessKss}
          legend={language === "zh" ? "过去五分钟内，你的困倦程度如何？" : "How sleepy have you felt during the immediately preceding five minutes?"}
          language={language}
        />
        {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
        <button className="primary-button survey-submit" type="submit" disabled={sleepinessKss === null}>
          {language === "zh" ? "继续旧版反应测试" : "Continue the legacy reaction step"}
        </button>
      </form>
    </main>
  );
}
