import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * TNG Phishing Defense – Mobile‑Only (single file React component)
 * -------------------------------------------------------------
 * • 完整移动端版本：大按钮、单手操作、简洁UI、轻动效。
 * • 5:00 倒计时，10题一轮；普通/进阶两档（同形域名、重定向、OAuth 钓鱼、MFA 轰炸等）。
 * • 本地排行榜（localStorage）。
 * • 移除了二维码与 Kiosk；新增：系统分享（Web Share API）、添加到主屏（PWA 安装提示）。
 * • 所有示例均为教学演示，非真实通知。
 *
 * 部署建议：
 *  1) 任意静态托管（Netlify / GitHub Pages / Vercel / Cloudflare Pages / Apps Script Web App）。
 *  2) 自定义短链接（如 /tng-quiz），把短链接印在海报上即可，无需二维码。
 *  3) 如需离线/PWA：在根目录加 manifest.json 与 sw.js，并在此组件挂载时注册 SW（见注释）。
 */

// ------------------------ 题库 ------------------------
const BASE_ITEMS = [
  {
    id: "sms_points",
    kind: "SMS",
    prompt:
      "【TNG】尊敬的用户：您的会员积分将于24小时内过期，请立即点击 https://tng-rewards.my-claim.com 领取礼品，逾期失效。",
    correctIsPhish: true,
    clues: [
      "链接域名非 tng.com.my 主域，使用多级子域与诱导词（立即/过期/礼品）",
      "官方一般不会通过短信附带链接要求点击领取",
    ],
    explanation:
      "常见‘积分过期+领奖’诱饵。遇到短信链接，先到官方 App 自查，不要直接点。",
  },
  {
    id: "sms_notify_no_link",
    kind: "SMS",
    prompt:
      "【TNG 通知】如非本人操作添加设备，请仅打开 TNG 官方 App → Settings → Devices 查看。我们不会通过短信索要OTP。",
    correctIsPhish: false,
    clues: [
      "不含链接，明确提示仅走官方 App 路径",
      "强调不会索要 OTP（良好信号）",
    ],
    explanation:
      "真正安全做法是引导用户自己在官方 App 内核实，不提供外链、不索要验证码。",
  },
  {
    id: "url_homograph",
    kind: "URL",
    prompt: "https://tпg.com.my.security-check.support/login",
    correctIsPhish: true,
    clues: [
      "主域应当是 tng.com.my，此处使用了同形字符（西里尔字母 п 代替 n）",
      "主域左侧堆叠可疑子域 security-check.support",
    ],
    explanation:
      "同形域名（IDN homograph）+ 过多子域是高危信号。务必只信任官方主域。",
  },
  {
    id: "url_clean",
    kind: "URL",
    prompt: "https://www.tngdigital.com.my/faq",
    correctIsPhish: false,
    clues: ["品牌与主域一致，路径为 FAQ，常见的静态内容页。"],
    explanation:
      "演示一个看起来正常的品牌域名与路径。仍建议从官方 App 内部跳转更安全。",
  },
  {
    id: "redirect_params",
    kind: "URL",
    prompt:
      "https://pay-help.my/link?redirect=https%3A%2F%2Ftng.com.my%2Fsignin&next=https%3A%2F%2Flogin-help.fix-issue.app%2Fcapture",
    correctIsPhish: true,
    clues: [
      "表面参数里出现 tng.com.my 迷惑视线，但实际 next= 指向陌生域 capture",
      "第三方域名 ‘fix-issue.app’ 与品牌不符，疑似二次跳转窃取凭证",
    ],
    explanation:
      "短链/中转页常用 redirect/next 参数做二次跳转。不要从链接登录，改用官方 App。",
  },
  {
    id: "oauth_consent_fake",
    kind: "授权页",
    prompt:
      "第三方服务请求访问你的 TNG 钱包：权限包括 ‘读取密码、获取OTP、修改支付PIN’。请输入账户密码确认。",
    correctIsPhish: true,
    clues: [
      "OAuth 授权页不会要求你在第三方页面输入钱包密码或 OTP",
      "权限描述异常（读取密码/获取OTP）本身就不合理",
    ],
    explanation:
      "区分 OAuth 授权（确认权限给令牌）与钓鱼收集（索要密码/OTP）。",
  },
  {
    id: "mfa_push",
    kind: "通知",
    prompt:
      "你正在登录 TNG Web，请在 30 秒内点击‘同意’完成认证。（你并未发起登录）",
    correctIsPhish: true,
    clues: [
      "这属于 MFA push 轰炸场景。未发起登录仍连收推送请求，应一律拒绝并改密、检查设备。",
    ],
    explanation:
      "遇到认证轰炸，一律拒绝→改密→检查登录设备→加强 2FA。",
  },
  {
    id: "refund_email_headers",
    kind: "邮件",
    prompt:
      "主题：Refund RM120 processed | 发件人：support@tng.com.my（Reply-To: refund@help-center.support）",
    correctIsPhish: true,
    clues: [
      "发件人与 Reply-To 不一致，回复被引导到陌生域 help-center.support",
    ],
    explanation:
      "检查邮件头部最有效：Reply-To 指向陌生域常用于诱导回复/继续行骗。",
  },
  {
    id: "official_no_otp",
    kind: "客服",
    prompt: "客服温馨提示：我们绝不索要密码/OTP/PIN。如遇相关请求，请立即举报。",
    correctIsPhish: false,
    clues: ["明确的安全政策宣告，通常来自官方渠道、无动作性外链。"],
    explanation: "记住红线：任何人向你索取 OTP 都是诈骗信号。",
  },
  {
    id: "qr_promo",
    kind: "海报",
    prompt:
      "校园福利活动：扫码领取 RM50 购书券（海报无主办单位、无活动细则、Logo 失真）",
    correctIsPhish: true,
    clues: [
      "无主办方抬头/合法条款，品牌元素错误（logo/颜色/留白不规范）",
      "诱导扫码+高额福利，典型线下社工入口",
    ],
    explanation:
      "线下钓鱼常见于二维码。先从学校官方渠道核实活动真伪。",
  },
  {
    id: "device_notice",
    kind: "App 提示",
    prompt:
      "App 内系统提示：检测到新设备尝试登录，是否是你本人？【是/否】【查看设备列表】",
    correctIsPhish: false,
    clues: [
      "在官方 App 内部的原生对话框，提供‘查看设备列表’自查而非外链",
    ],
    explanation:
      "从 App 内做设备核验是更安全的路径。",
  },
  {
    id: "fake_support_call",
    kind: "来电脚本",
    prompt:
      "‘这里是 TNG 安全部门，你的钱包异常，请提供一次性验证码，我们帮你解除冻结。’",
    correctIsPhish: true,
    clues: ["假冒官方+紧迫感+索要验证码（三件套）"],
    explanation:
      "真正客服不会索要 OTP。应自行挂断，转官方渠道核实。",
  },
];

const ADVANCED_ITEMS = [
  {
    id: "dns_unicode",
    kind: "URL",
    prompt: "https://xn--tgdigital-9p2b.com.my/security",
    correctIsPhish: true,
    clues: [
      "Punycode 形式（xn--）提示存在 Unicode 域名；与品牌拼写不一致",
    ],
    explanation: "看到 xn-- 前缀需格外谨慎，常用于同形攻击。",
  },
  {
    id: "param_exfil",
    kind: "URL",
    prompt:
      "https://promo.my/claim?email=you@university.edu&amount=50&callback=https://grab-info.tld/collect",
    correctIsPhish: true,
    clues: [
      "疑似在 URL 明文携带个人信息，并设置 callback 到陌生域收集",
    ],
    explanation: "谨防参数外传与 callback 收集。",
  },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(1, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

const LS_KEY = "tng-phish-scores";

function readScores() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeScores(scores) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(scores.slice(0, 15)));
  } catch {}
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [roundKey, setRoundKey] = useState(0);
  const [canInstall, setCanInstall] = useState(false);
  const deferredPromptRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const pool = React.useMemo(() => {
    const base = BASE_ITEMS.slice();
    if (hardMode) base.push(...ADVANCED_ITEMS);
    return shuffle(base).slice(0, 10);
  }, [hardMode, roundKey]);

  const left = useCountdown(started ? 5 * 60 : 0);
  const current = pool[idx];
  const finished = started && (left === 0 || idx >= pool.length);

  useEffect(() => {
    if (finished) {
      const scores = readScores();
      const entry = { when: new Date().toISOString(), score, total: pool.length, hard: hardMode };
      const next = [entry, ...scores].sort((a, b) => b.score - a.score);
      writeScores(next);
    }
  }, [finished]); // eslint-disable-line

  const restart = () => {
    setStarted(false);
    setIdx(0);
    setScore(0);
    setAnswers([]);
    setRoundKey((k) => k + 1);
  };

  const onPick = (pickIsPhish) => {
    if (!current) return;
    const correct = pickIsPhish === current.correctIsPhish;
    if (!correct && navigator?.vibrate) navigator.vibrate?.(60);
    setScore((s) => s + (correct ? 1 : 0));
    setAnswers((arr) => [...arr, { id: current.id, userPick: pickIsPhish, correct }]);
    setIdx((i) => i + 1);
  };

  const shareLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "TNG Phishing Defense", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("链接已复制，快发给同学一起玩！");
      }
    } catch {}
  };

  const askInstall = async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setCanInstall(false);
    deferredPromptRef.current = null;
  };

  const results = readScores();

  const Progress = () => (
    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mt-3" aria-hidden>
      <motion.div
        className="h-full bg-gradient-to-r from-emerald-400 to-teal-400"
        initial={{ width: 0 }}
        animate={{ width: `${((idx) / pool.length) * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(1, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  return (
    <div
      className="min-h-screen w-full text-slate-50 flex items-center justify-center p-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]"
      style={{
        background:
          "radial-gradient(1200px 800px at 80% -10%, rgba(56,189,248,0.15), transparent 60%),radial-gradient(1200px 800px at 0% 110%, rgba(16,185,129,0.12), transparent 60%)",
        backgroundColor: "#0b1220",
      }}
    >
      <div className="w-full max-w-md mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold tracking-tight drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]">
            TNG Phishing Defense
          </h1>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hardMode}
                onChange={(e) => setHardMode(e.target.checked)}
              />
              进阶
            </label>
            {canInstall && (
              <button
                onClick={askInstall}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 backdrop-blur"
              >
                + 主屏
              </button>
            )}
            <button
              onClick={shareLink}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 backdrop-blur"
            >
              分享
            </button>
          </div>
        </header>

        {!started && (
          <div
            className="bg-white/5 rounded-2xl p-5 shadow-lg border border白/10 backdrop-blur"
          >
            <p className="text-slate-200 leading-relaxed text-sm">
              5 分钟 10 题，判断 <b>可疑(Phish)</b> 还是 <b>安全(Legit)</b>。
              包含短信、URL、授权页、来电话术等。
            </p>
            <ul className="list-disc pl-6 mt-3 text-slate-300 text-xs space-y-1">
              <li><b>进阶</b>含同形域名、重定向参数、OAuth 钓鱼、MFA 轰炸。</li>
              <li>红线：<b>不点陌生链接、不说 OTP、只走官方 App</b>。</li>
            </ul>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-white/70">准备好就开始吧</span>
              <button
                onClick={() => setStarted(true)}
                className="px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold shadow"
              >
                开始挑战
              </button>
            </div>
          </div>
        )}

        {started && !finished && current && (
          <div
            key={current.id}
            className="rounded-2xl p-4 shadow-xl border border-white/10 backdrop-blur bg白/5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-300">
                {current.kind}
              </div>
              <div className="text-xs text-slate-300">
                ⏳ {formatTime(left)} · {idx + 1}/{pool.length}
              </div>
            </div>
            <div className="rounded-xl p-3 text-base leading-relaxed border border-white/10 bg-slate-900/40">
              {current.prompt}
            </div>
            <Progress />
            <div className="grid grid-cols-1 gap-3 mt-4">
              <button
                onClick={() => onPick(true)}
                className="rounded-2xl py-4 px-4 text-lg font-bold bg-rose-400 text-slate-900 hover:bg-rose-300"
                aria-label="判断为可疑"
              >
                ⚠️ 可疑 (Phish)
              </button>
              <button
                onClick={() => onPick(false)}
                className="rounded-2xl py-4 px-4 text-lg font-bold bg-emerald-400 text-slate-900 hover:bg-emerald-300"
                aria-label="判断为安全"
              >
                ✅ 安全 (Legit)
              </button>
            </div>
            <details className="mt-4">
              <summary className="text-slate-300 cursor-pointer">提示 / 复习线索</summary>
              <ul className="list-disc pl-6 mt-2 text-sm text-slate-200 space-y-1">
                {current.clues.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-300">{current.explanation}</p>
            </details>
          </div>
        )}

        {finished && (
          <div
            className="bg-white/5 rounded-2xl p-6 shadow-xl border border-white/10 backdrop-blur"
          >
            <h2 className="text-2xl font-bold mb-1">本轮结束！</h2>
            <p className="text-slate-200">
              你的得分：<b>{score}</b> / {pool.length}（模式：{hardMode ? "进阶" : "普通"}）
            </p>
            <div className="mt-4 grid gap-3 max-h-[45vh] overflow-auto pr-1">
              {answers.map((a, i) => {
                const item = pool.find((x) => x.id === a.id) || { prompt: "" };
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border ${a.correct ? "bg-emerald-500/10 border-emerald-400/30" : "bg-rose-500/10 border-rose-400/30"}`}
                  >
                    <div className="text-xs text-slate-300 mb-1">{item.kind}</div>
                    <div className="text-sm leading-relaxed">{item.prompt}</div>
                    <div className="mt-1 text-xs">
                      你的判断：{a.userPick ? "可疑" : "安全"} · 正确答案：
                      {item.correctIsPhish ? "可疑" : "安全"} {a.correct ? "✅" : "❌"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-5">
              <button
                onClick={restart}
                className="px-4 py-2 rounded-xl bg-indigo-400 text-slate-900 font-semibold hover:bg-indigo-300"
              >
                再来一局
              </button>
              <button
                onClick={shareLink}
                className="px-3 py-2 rounded-xl bg-cyan-400/90 hover:bg-cyan-300 text-slate-900 font-semibold"
              >
                分享给同学
              </button>
            </div>
          </div>
        )}

        <section className="mt-6">
          <h3 className="text-lg font-semibold mb-2">排行榜（本机）</h3>
          {results.length === 0 ? (
            <p className="text-slate-300 text-sm">暂无记录，开始一局来上榜吧！</p>
          ) : (
            <ol className="space-y-2">
              {results.slice(0, 8).map((r, i) => (
                <li
                  key={i}
                  className="grid grid-cols-6 gap-2 items-center bg-white/5 rounded-xl p-2 text-sm border border-white/10 backdrop-blur"
                >
                  <div className="col-span-1 text-center font-bold">#{i + 1}</div>
                  <div className="col-span-2">{new Date(r.when).toLocaleTimeString()}</div>
                  <div className="col-span-2">分数：{r.score} / {r.total}</div>
                  <div className="col-span-1 text-right">{r.hard ? "进阶" : "普通"}</div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mt-8 text-xs text-slate-400">
          教学演示用途 · 请勿将示例链接用于真实环境 · 牢记：不点陌生链接、不说OTP、只走官方渠道。
        </footer>
      </div>
    </div>
  );
}
