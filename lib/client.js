window.__ModuleLoader__.load({
	id: "dancing-lyrics-toast",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		const h = react.createElement;

		/** Locale namespace and dictionaries for the settings entry. */
		const NS = "dancing-lyrics-toast.settings";
		const zh = {
			nav: "桌面提示",
			title: "桌面提示（dancing-lyrics-toast）",
			intro: "会话事件以 Limbus 风格文字动画推送到 Windows 桌面。改动保存后，下一条提示立即生效。",
			save: "保存",
			saving: "保存中…",
			saved: "已保存 ✓",
			reload: "重新加载",
			loadFailed: "加载配置失败（宿主未就绪或插件未启用）",
			conflict: "配置已被其他窗口修改，已重新加载，请重试",
			notWritable: "当前连接对宿主配置只读（非本机回环连接）",
			groups: {
				events: "事件与文案",
				font: "字体",
				colors: "颜色",
				animation: "动画",
				overlay: "悬浮窗",
				companion: "伴侣窗口"
			},
			placeholders: "占位符：{tool} {outcome} {title} {sessionId}",
			test: {
				title: "测试动画",
				intro: "向伴侣窗口推送样例提示，验证文案与动画效果。",
				playAll: "连播全部",
				launch: "拉起伴侣窗口",
				pushed: "已推送到 {n} 个伴侣窗口 ✓",
				pushedNone: "已推送，但没有伴侣窗口在连接",
				launched: "伴侣窗口已连接 ({n}) ✓",
				launchedNone: "已尝试拉起，稍候再点测试看看",
				failed: "宿主未响应测试请求"
			},
			testKinds: {
				permission: "需要授权",
				"permission-done": "授权完成",
				"turn-start": "思考中",
				"turn-end": "任务完成"
			}
		};
		const en = {
			nav: "Desktop Toast",
			title: "Desktop Toast (dancing-lyrics-toast)",
			intro: "Session events as Limbus-style text toasts on the Windows desktop. Saved changes apply from the next toast on.",
			save: "Save",
			saving: "Saving…",
			saved: "Saved ✓",
			reload: "Reload",
			loadFailed: "Failed to load config (host not ready or plugin disabled)",
			conflict: "The config changed elsewhere; reloaded — please retry",
			notWritable: "This connection is read-only for host config (non-loopback)",
			groups: {
				events: "Events & messages",
				font: "Font",
				colors: "Colors",
				animation: "Animation",
				overlay: "Overlay",
				companion: "Companion window"
			},
			placeholders: "Placeholders: {tool} {outcome} {title} {sessionId}",
			test: {
				title: "Test animation",
				intro: "Push sample toasts to the companion window to verify copy and animation.",
				playAll: "Play all",
				launch: "Launch companion",
				pushed: "Pushed to {n} companion window(s) ✓",
				pushedNone: "Pushed, but no companion is connected",
				launched: "Companion connected ({n}) ✓",
				launchedNone: "Launch attempted — try the test buttons shortly",
				failed: "Host did not answer the test request"
			},
			testKinds: {
				permission: "Permission",
				"permission-done": "Approved",
				"turn-start": "Thinking",
				"turn-end": "Done"
			}
		};

		/**
		 * The form layout: groups of field specs, rendered generically. `path`
		 * addresses the config object; `type` picks the editor.
		 */
		const GROUPS = [
			{
				key: "events", fields: [
					{ path: "events.permission.enabled", type: "bool", label: "需要授权时推送" },
					{ path: "events.permission.text", type: "line", label: "文案 · 需要授权" },
					{ path: "events.permission-done.enabled", type: "bool", label: "授权完成后推送" },
					{ path: "events.permission-done.text", type: "line", label: "文案 · 授权完成" },
					{ path: "events.turn-start.enabled", type: "bool", label: "回合开始时推送" },
					{ path: "events.turn-start.text", type: "line", label: "文案 · 回合开始" },
					{ path: "events.turn-end.enabled", type: "bool", label: "回合结束时推送" },
					{ path: "events.turn-end.text", type: "line", label: "文案 · 回合结束" }
				]
			},
			{
				key: "font", fields: [
					{ path: "font.family", type: "select", label: "字体", options: ["默认", "微软雅黑", "宋体", "楷体", "黑体", "自定义字体文件"] },
					{ path: "font.customPath", type: "line", label: "自定义字体文件路径（TTF/OTF/TTC）" },
					{ path: "font.weight", type: "number", label: "字重", min: 100, max: 900, step: 100 }
				]
			},
			{
				key: "colors", fields: [
					{ path: "colors.core", type: "color", label: "字芯颜色" },
					{ path: "colors.outline", type: "line", label: "描边颜色（可用 rgba()）" },
					{ path: "colors.outlineWidth", type: "number", label: "描边宽度（px）", min: 0, max: 6, step: 0.5 },
					{ path: "colors.halo", type: "color", label: "光晕颜色（基础）" },
					{ path: "colors.glow", type: "number", label: "发光强度（%）", min: 0, max: 100, step: 5 },
					{ path: "colors.accentPermission", type: "color", label: "强调色 · 需要授权" },
					{ path: "colors.accentPermissionDone", type: "color", label: "强调色 · 授权完成" },
					{ path: "colors.accentThinking", type: "color", label: "强调色 · 思考中" },
					{ path: "colors.accentTurnEnd", type: "color", label: "强调色 · 任务完成" }
				]
			},
			{
				key: "animation", fields: [
					{ path: "animation.entry", type: "select", label: "入场", options: ["ripple", "drop"] },
					{ path: "animation.exit", type: "select", label: "退场", options: ["ripple", "drop"] },
					{ path: "animation.motion", type: "select", label: "停留律动", options: ["wave", "jitter", "none"] },
					{ path: "animation.speed", type: "number", label: "速度倍率", min: 0.25, max: 3, step: 0.25 },
					{ path: "animation.jitter", type: "number", label: "抖动频率（次/秒）", min: 0, max: 15, step: 1 },
					{ path: "animation.waveAmplitude", type: "number", label: "波动幅度（px）", min: 0, max: 20, step: 1 },
					{ path: "animation.dropDistance", type: "number", label: "跌落距离（px）", min: 0, max: 128, step: 8 },
					{ path: "animation.tilt", type: "number", label: "整句倾斜（度）", min: -20, max: 20, step: 1 }
				]
			},
			{
				key: "overlay", fields: [
					{ path: "overlay.position", type: "select", label: "位置（sides=两侧随机）", options: ["sides", "bottom-right", "bottom-center", "top-center"] },
					{ path: "overlay.margin", type: "number", label: "边缘距离（px）", min: 0, max: 400, step: 8 },
					{ path: "overlay.vFrom", type: "number", label: "垂直活动区上界（%）", min: 0, max: 99, step: 5 },
					{ path: "overlay.vTo", type: "number", label: "垂直活动区下界（%）", min: 1, max: 100, step: 5 },
					{ path: "overlay.fontSize", type: "number", label: "字号（px）", min: 12, max: 96, step: 1 },
					{ path: "overlay.displaySeconds", type: "number", label: "停留秒数", min: 1, max: 60, step: 1 },
					{ path: "port", type: "number", label: "本地 SSE 端口", min: 1024, max: 65535, step: 1 }
				]
			},
			{
				key: "companion", fields: [
					{ path: "companion.launch", type: "bool", label: "插件加载时自动启动伴侣窗口" },
					{ path: "companion.path", type: "line", label: "伴侣目录（留空用插件自带 companion/）" }
				]
			}
		];

		/** Read a nested value by dotted path. */
		function getPath(value, path) {
			let current = value;
			for (const key of path.split(".")) {
				if (current === undefined || current === null) return undefined;
				current = current[key];
			}
			return current;
		}

		/** Immutably set a nested value by dotted path. */
		function setPath(root, path, value) {
			const keys = path.split(".");
			const clone = (node) => (Array.isArray(node) ? [...node] : { ...node });
			const result = clone(root);
			let target = result;
			for (let i = 0; i < keys.length - 1; i += 1) {
				target[keys[i]] = clone(target[keys[i]]);
				target = target[keys[i]];
			}
			target[keys[keys.length - 1]] = value;
			return result;
		}

		/** Best-effort hex for a <input type=color>; unparsable values fall back to white. */
		function toHex(value) {
			const text = String(value ?? "");
			const six = /^#([0-9a-fA-F]{6})$/.exec(text);
			if (six) return text;
			const three = /^#([0-9a-fA-F]{3})$/.exec(text);
			if (three) return "#" + three[1].split("").map((c) => c + c).join("");
			const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(text);
			if (rgb) {
				const part = (n) => Number(n).toString(16).padStart(2, "0");
				return `#${part(rgb[1])}${part(rgb[2])}${part(rgb[3])}`;
			}
			return "#ffffff";
		}

		//#region styles
		function ensureStyle() {
			const existing = document.getElementById("dancing-lyrics-toast-style");
			const style = existing !== null ? existing : document.createElement("style");
			if (existing === null) {
				style.id = "dancing-lyrics-toast-style";
				document.head.appendChild(style);
			}
			style.textContent = [
				".dsh-dt-page{display:flex;flex-direction:column;gap:14px;max-width:720px}",
				".dsh-dt-intro{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}",
				".dsh-dt-group{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}",
				".dsh-dt-group-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
				".dsh-dt-row{display:flex;align-items:center;justify-content:space-between;gap:12px}",
				".dsh-dt-label{font-size:12.5px;color:var(--dsw-alias-label-secondary);flex:none}",
				".dsh-dt-line{flex:1;max-width:380px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}",
				".dsh-dt-line:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}",
				".dsh-dt-select{padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}",
				".dsh-dt-color{display:flex;align-items:center;gap:8px}",
				".dsh-dt-color input[type=color]{width:34px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;cursor:pointer}",
				".dsh-dt-bar{display:flex;align-items:center;gap:10px}",
				".dsh-dt-btn{padding:6px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}",
				".dsh-dt-btn:hover{background:var(--dsw-alias-bg-layer-2)}",
				".dsh-dt-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}",
				".dsh-dt-status{font-size:12px;color:var(--dsw-alias-label-secondary)}",
				".dsh-dt-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}"
			].join("");
		}
		//#endregion

		//#region test card
		/** The same-origin route the host's test endpoint listens on. */
		const TEST_ROUTE = "/plugins/dancing-lyrics-toast/test";
		/** Event kinds in play order, labels resolved through the locale dict. */
		const TEST_KINDS = ["permission", "permission-done", "turn-start", "turn-end"];

		/** One sample toast per kind, staggered by `delay` ms. */
		async function postTest(body) {
			const response = await fetch(TEST_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.json();
		}

		/** Fill the {n} hole of a count-bearing dictionary line. */
		function fmtCount(text, n) {
			return String(text).replace("{n}", String(n))
		}

		/**
		 * Test-animation card: fire sample toasts of each kind (or all four in
		 * sequence), launch the companion on demand, and report how many
		 * companion windows received the push — the settings page's live probe
		 * for "is the animation pipeline actually working".
		 */
		function TestCard({ t }) {
			const [busy, setBusy] = react.useState(false);
			const [message, setMessage] = react.useState(null);
			const dict = t("test");
			const kinds = t("testKinds");

			const fire = async (body, answer) => {
				setBusy(true);
				try {
					const result = await postTest(body);
					setMessage({ ok: (result.receivers ?? 0) > 0, text: answer(result.receivers ?? 0) });
				} catch (error) {
					console.warn("[dancing-lyrics-toast] test failed", error);
					setMessage({ ok: false, text: `${dict.failed} — ${error instanceof Error ? error.message : String(error)}` });
				} finally {
					setBusy(false);
				}
			};

			const playAll = async () => {
				setBusy(true);
				let receivers = 0;
				try {
					for (const kind of TEST_KINDS) {
						const result = await postTest({ kind });
						receivers = result.receivers ?? 0;
						await new Promise((resolve) => setTimeout(resolve, 1400));
					}
					setMessage({ ok: receivers > 0, text: receivers > 0 ? fmtCount(dict.pushed, receivers) : dict.pushedNone });
				} catch (error) {
					setMessage({ ok: false, text: `${dict.failed} — ${error instanceof Error ? error.message : String(error)}` });
				} finally {
					setBusy(false);
				}
			};

			return h("div", { className: "dsh-dt-group" }, [
				h("div", { className: "dsh-dt-group-title" }, dict.title),
				h("p", { className: "dsh-dt-intro", style: { margin: 0 } }, dict.intro),
				h("div", { className: "dsh-dt-bar", style: { flexWrap: "wrap" } }, [
					...TEST_KINDS.map((kind) => h("button", {
						key: kind, className: "dsh-dt-btn", disabled: busy,
						onClick: () => void fire({ kind }, (n) => n > 0 ? fmtCount(dict.pushed, n) : dict.pushedNone)
					}, kinds[kind])),
					h("button", { className: "dsh-dt-btn dsh-dt-btn-primary", disabled: busy, onClick: playAll }, dict.playAll),
					h("button", { className: "dsh-dt-btn", disabled: busy, onClick: () => void fire({ action: "launch" }, (n) => n > 0 ? fmtCount(dict.launched, n) : dict.launchedNone) }, dict.launch),
					message === null ? null : h("span", { className: message.ok ? "dsh-dt-status" : "dsh-dt-error" }, message.text)
				])
			]);
		}
		//#endregion
		/** One labeled row with the editor chosen by the field spec's type. */
		function FieldRow({ spec, value, onChange }) {
			const editor = (() => {
				switch (spec.type) {
					case "bool":
						return h("input", {
							type: "checkbox", checked: value === true,
							onChange: (event) => onChange(event.target.checked)
						});
					case "line":
						return h("input", {
							className: "dsh-dt-line", type: "text", value: value ?? "",
							onChange: (event) => onChange(event.target.value)
						});
					case "number":
						return h("input", {
							className: "dsh-dt-line", type: "number", value: value ?? 0,
							min: spec.min, max: spec.max, step: spec.step,
							style: { maxWidth: 120 },
							onChange: (event) => {
								const next = Number(event.target.value);
								if (Number.isFinite(next)) onChange(next);
							}
						});
					case "select":
						return h("select", {
							className: "dsh-dt-select", value: value ?? spec.options[0],
							onChange: (event) => onChange(event.target.value)
						}, spec.options.map((option) => h("option", { key: option, value: option }, option)));
					case "color":
						return h("div", { className: "dsh-dt-color" }, [
							h("input", {
								type: "color", value: toHex(value),
								onChange: (event) => onChange(event.target.value)
							}),
							h("input", {
								className: "dsh-dt-line", type: "text", value: value ?? "",
								style: { maxWidth: 150 },
								onChange: (event) => onChange(event.target.value)
							})
						]);
					default:
						return null;
				}
			})();
			return h("div", { className: "dsh-dt-row" }, [
				h("span", { className: "dsh-dt-label" }, spec.label),
				editor
			]);
		}

		/** One collapsible group card. */
		function GroupCard({ title, fields, draft, onChange }) {
			return h("div", { className: "dsh-dt-group" }, [
				h("div", { className: "dsh-dt-group-title" }, title),
				...fields.map((spec) => h(FieldRow, {
					key: spec.path, spec,
					value: getPath(draft, spec.path),
					onChange: (next) => onChange(setPath(draft, spec.path, next))
				}))
			]);
		}
		//#endregion

		/**
		 * The settings page: reads and writes the plugin's config through the
		 * same-origin route the host half registers (`/plugins/dancing-lyrics-toast/
		 * config`). The bundle row sits at the composition root, outside the DSH
		 * config editor's enumeration, so the settings transport has no namespace
		 * for this plugin — the host persists edits to its own state file instead.
		 */
		const CONFIG_ROUTE = "/plugins/dancing-lyrics-toast/config";

		function SettingsPage({ ctx, t }) {
			const [state, setState] = react.useState({ status: "loading", draft: null, note: "", error: "" });
			const [saving, setSaving] = react.useState(false);

			const load = react.useCallback(async () => {
				try {
					const response = await fetch(CONFIG_ROUTE, { cache: "no-store" });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const config = await response.json();
					if (config === null || typeof config !== "object") throw new Error("config is not an object");
					setState({ status: "ready", draft: config, note: "", error: "" });
				} catch (error) {
					console.warn("[dancing-lyrics-toast] settings load failed", error);
					const detail = error instanceof Error ? error.message : String(error);
					setState((prev) => ({ ...prev, status: "error", error: `${t("loadFailed")} — ${detail}` }));
				}
			}, [t]);

			react.useEffect(() => {
				void load();
			}, [load]);

			const save = async () => {
				setSaving(true);
				try {
					const response = await fetch(CONFIG_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(state.draft)
					});
					const answer = await response.json().catch(() => ({}));
					if (!response.ok) {
						setState((prev) => ({ ...prev, note: "error", error: answer?.message ?? `HTTP ${response.status}` }));
						return;
					}
					setState((prev) => ({ ...prev, draft: answer.config ?? prev.draft, note: "saved", error: "" }));
					setTimeout(() => setState((prev) => (prev.note === "saved" ? { ...prev, note: "" } : prev)), 2000);
				} catch (error) {
					console.warn("[dancing-lyrics-toast] settings save failed", error);
					setState((prev) => ({ ...prev, note: "error", error: error instanceof Error ? error.message : String(error) }));
				} finally {
					setSaving(false);
				}
			};

			ensureStyle();
			if (state.status !== "ready" || state.draft === null) {
				return h("div", { className: "dsh-dt-page" }, [
					h("p", { className: "dsh-dt-error", style: { whiteSpace: "pre-wrap", wordBreak: "break-all" } },
						state.status === "error" ? state.error : "…")
				]);
			}
			return h("div", { className: "dsh-dt-page" },
				[
					h("p", { className: "dsh-dt-intro" }, t("intro")),
					h(TestCard, { key: "test", t }),
					...GROUPS.map((group) => h(GroupCard, {
						key: group.key,
						title: group.key === "events" ? `${t("groups").events}（${t("placeholders")}）` : t("groups")[group.key],
						fields: group.fields,
						draft: state.draft,
						onChange: (draft) => setState((prev) => ({ ...prev, draft }))
					})),
					h("div", { className: "dsh-dt-bar" }, [
						h("button", { className: "dsh-dt-btn dsh-dt-btn-primary", disabled: saving, onClick: save },
							saving ? t("saving") : t("save")),
						h("button", { className: "dsh-dt-btn", onClick: () => void load() }, t("reload")),
						h("span", { className: state.note === "error" ? "dsh-dt-error" : "dsh-dt-status" },
							state.note === "saved" ? t("saved") : state.note === "error" ? state.error : "")
					])
				]);
		}

		//#region plugin body
		const inject = ["slots", "locale"];

		/**
		 * Client half: register the settings section only. The toast pipeline
		 * lives entirely in the host half and the companion window; settings
		 * read/write goes through the host's same-origin config route.
		 * @param ctx - the browser plugin context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dancing-lyrics-toast: settings dictionaries");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dancing-lyrics-toast",
				order: 46,
				label: () => t("nav"),
				locale: NS
			}, () => h(SettingsPage, { ctx, t })));
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
