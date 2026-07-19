// ==UserScript==
// @name         Penguin Translator
// @namespace    https://github.com/opblackyo/penguin-translator
// @version      0.3.0
// @description  Private iOS Safari shell for the owner's Penguin Translator API.
// @match        http://*/test-page/*
// @match        http://*/m1-test-page/*
// @match        http://*/m2-test-page/*
// @match        https://omegascans.org/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM.addStyle
// ==/UserScript==
(function() {
	//#region apps/shortcut-client/src/shared/image-identity.ts
	var IMAGE_ID_ATTRIBUTE = "data-penguin-translator-image-id";
	var IMAGE_ID_PREFIX = "penguin-image-";
	var fallbackSequence = 0;
	function createCandidateId() {
		if (typeof globalThis.crypto?.randomUUID === "function") return `${IMAGE_ID_PREFIX}${globalThis.crypto.randomUUID()}`;
		fallbackSequence += 1;
		return `${IMAGE_ID_PREFIX}${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
	}
	function findImageByClientId(clientImageId) {
		return Array.from(document.querySelectorAll(`img[${IMAGE_ID_ATTRIBUTE}]`)).find((image) => image.getAttribute(IMAGE_ID_ATTRIBUTE) === clientImageId);
	}
	function ensureImageClientId(image) {
		const existing = image.getAttribute(IMAGE_ID_ATTRIBUTE);
		if (existing) return existing;
		let candidate = createCandidateId();
		while (findImageByClientId(candidate)) candidate = createCandidateId();
		image.setAttribute(IMAGE_ID_ATTRIBUTE, candidate);
		return candidate;
	}
	//#endregion
	//#region apps/shortcut-client/src/extractor/visibility.ts
	function getVisibilityRejectionReasons(element, rect = element.getBoundingClientRect(), viewport = window, requireViewportIntersection = true) {
		const style = getComputedStyle(element);
		const reasons = [];
		if (style.display === "none") reasons.push("CSS_DISPLAY_NONE");
		if (style.visibility === "hidden") reasons.push("CSS_VISIBILITY_HIDDEN");
		if (style.opacity === "0") reasons.push("CSS_OPACITY_ZERO");
		if (rect.width <= 0) reasons.push("RENDERED_WIDTH_ZERO");
		if (rect.height <= 0) reasons.push("RENDERED_HEIGHT_ZERO");
		if (requireViewportIntersection) {
			if (rect.bottom <= 0) reasons.push("OUTSIDE_VIEWPORT_ABOVE");
			if (rect.right <= 0) reasons.push("OUTSIDE_VIEWPORT_LEFT");
			if (rect.top >= viewport.innerHeight) reasons.push("OUTSIDE_VIEWPORT_BELOW");
			if (rect.left >= viewport.innerWidth) reasons.push("OUTSIDE_VIEWPORT_RIGHT");
		}
		return reasons;
	}
	var MIN_NATURAL_EDGE = 200;
	var MIN_RENDERED_EDGE = 100;
	var GENERIC_UI_HINT = /(?:^|[\s_-])(avatar|logo|icon|advert|advertisement|banner|badge|emoji|profile)(?:$|[\s_-])/i;
	function isHttpUrl(value) {
		try {
			const url = new URL(value, document.baseURI);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	}
	/** Round a CSS-pixel measurement to the nearest positive integer for the API contract. */
	function normalizeRenderedDimension(value) {
		if (!Number.isFinite(value)) throw new Error("Rendered image dimensions must be finite.");
		return Math.max(1, Math.round(value));
	}
	function srcsetCandidate(image) {
		return (image.getAttribute("srcset") ?? "").split(",").map((candidate) => candidate.trim().split(/\s+/, 1)[0] ?? "").filter(Boolean).at(-1) ?? "";
	}
	function resolveImageSource(image) {
		const lazySource = image.getAttribute("data-src") ?? image.getAttribute("data-lazy-src") ?? image.getAttribute("data-original") ?? "";
		const preferred = [
			image.currentSrc,
			lazySource,
			srcsetCandidate(image),
			image.src
		];
		return preferred.find((candidate) => candidate && isHttpUrl(candidate)) ?? preferred.find(Boolean) ?? "";
	}
	function hasGenericUiAssetEvidence(image) {
		if (image.getAttribute("aria-hidden") === "true" || image.getAttribute("role") === "presentation") return true;
		const evidence = [
			image.id,
			image.className,
			image.alt,
			image.getAttribute("role") ?? ""
		].join(" ");
		return GENERIC_UI_HINT.test(evidence);
	}
	function collectVisibleImagesWithDiagnostics(options = {}) {
		const images = [];
		const rejected = [];
		const acceptedSources = /* @__PURE__ */ new Set();
		const requireViewportIntersection = options.requireViewportIntersection ?? true;
		for (const image of Array.from(document.images)) {
			const source = resolveImageSource(image);
			const absoluteSource = isHttpUrl(source) ? new URL(source, document.baseURI).href : source;
			const rect = image.getBoundingClientRect();
			const style = getComputedStyle(image);
			const reasons = [];
			const naturalSizeIsLargeEnough = image.naturalWidth >= MIN_NATURAL_EDGE && image.naturalHeight >= MIN_NATURAL_EDGE;
			const renderedSizeIsLargeEnough = rect.width >= MIN_RENDERED_EDGE && rect.height >= MIN_RENDERED_EDGE;
			if (!source) reasons.push("MISSING_SOURCE");
			else if (!isHttpUrl(source)) reasons.push("UNSUPPORTED_SOURCE_PROTOCOL");
			if (hasGenericUiAssetEvidence(image)) reasons.push("GENERIC_UI_ASSET_HINT");
			if (!naturalSizeIsLargeEnough && !renderedSizeIsLargeEnough) {
				if (image.naturalWidth < MIN_NATURAL_EDGE) reasons.push("NATURAL_WIDTH_BELOW_MINIMUM");
				if (image.naturalHeight < MIN_NATURAL_EDGE) reasons.push("NATURAL_HEIGHT_BELOW_MINIMUM");
				if (rect.width < MIN_RENDERED_EDGE) reasons.push("RENDERED_WIDTH_BELOW_MINIMUM");
				if (rect.height < MIN_RENDERED_EDGE) reasons.push("RENDERED_HEIGHT_BELOW_MINIMUM");
			}
			reasons.push(...getVisibilityRejectionReasons(image, rect, window, requireViewportIntersection));
			if (reasons.length === 0 && absoluteSource && acceptedSources.has(absoluteSource)) reasons.push("DUPLICATE_SOURCE");
			if (reasons.length === 0) {
				acceptedSources.add(absoluteSource);
				images.push({
					client_image_id: ensureImageClientId(image),
					source_kind: "url",
					source: absoluteSource,
					rendered_width: normalizeRenderedDimension(rect.width),
					rendered_height: normalizeRenderedDimension(rect.height)
				});
			} else rejected.push({
				id: image.id || null,
				source,
				complete: image.complete,
				natural_width: image.naturalWidth,
				natural_height: image.naturalHeight,
				rendered_rect: {
					width: rect.width,
					height: rect.height,
					top: rect.top,
					right: rect.right,
					bottom: rect.bottom,
					left: rect.left
				},
				computed_style: {
					display: style.display,
					visibility: style.visibility,
					opacity: style.opacity
				},
				reasons
			});
		}
		return {
			images,
			diagnostics: {
				document_ready_state: document.readyState,
				viewport: {
					width: window.innerWidth,
					height: window.innerHeight
				},
				total_images: document.images.length,
				accepted_images: images.length,
				rejected
			},
			warnings: []
		};
	}
	function waitForLazyContent(milliseconds) {
		return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
	}
	function normalizedSource(image) {
		const source = resolveImageSource(image);
		return isHttpUrl(source) ? new URL(source, document.baseURI).href : source;
	}
	function sourceDiscoverySignature() {
		return Array.from(document.images, normalizedSource).filter(Boolean).sort().join("\n");
	}
	function documentImageStateSignature() {
		return Array.from(document.images, (image) => [
			normalizedSource(image),
			image.currentSrc,
			image.getAttribute("src") ?? "",
			image.naturalWidth,
			image.naturalHeight,
			image.complete ? 1 : 0
		].join("|")).join("\n");
	}
	function mergeDiscoveredImages(target, collection) {
		for (const image of collection.images) if (!target.has(image.source)) target.set(image.source, image);
	}
	async function collectPageImagesWithDiagnostics(options = {}) {
		const maxSteps = options.maxSteps ?? 8;
		const settleMilliseconds = options.settleMilliseconds ?? 40;
		const timeBudgetMilliseconds = options.timeBudgetMilliseconds ?? 2200;
		const stableScanLimit = options.stableScanLimit ?? 2;
		const minimumScanSteps = options.minimumScanSteps ?? 3;
		const deadlineReserveMilliseconds = options.deadlineReserveMilliseconds ?? 100;
		const now = options.now ?? (() => performance.now());
		const wait = options.wait ?? waitForLazyContent;
		const originalX = window.scrollX;
		const originalY = window.scrollY;
		const viewportHeight = Math.max(window.innerHeight, 320);
		const step = Math.max(320, Math.floor(viewportHeight * .8));
		const effectiveDeadline = now() + timeBudgetMilliseconds - Math.min(deadlineReserveMilliseconds, timeBudgetMilliseconds / 4);
		let maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
		let requestedSteps = Math.ceil(maximumScroll / step) + 1;
		let scanSteps = Math.min(maxSteps, requestedSteps);
		const warnings = [];
		const discoveredImages = /* @__PURE__ */ new Map();
		let latestCollection = collectVisibleImagesWithDiagnostics({ requireViewportIntersection: false });
		mergeDiscoveredImages(discoveredImages, latestCollection);
		let imageStateSignature = documentImageStateSignature();
		let discoverySignature = sourceDiscoverySignature();
		let stableScans = 0;
		let completedSteps = 0;
		let timeBudgetReached = now() >= effectiveDeadline;
		const refreshCollectionWhenChanged = () => {
			const nextStateSignature = documentImageStateSignature();
			if (nextStateSignature === imageStateSignature) return;
			imageStateSignature = nextStateSignature;
			latestCollection = collectVisibleImagesWithDiagnostics({ requireViewportIntersection: false });
			mergeDiscoveredImages(discoveredImages, latestCollection);
		};
		try {
			if (maximumScroll > 0 && !timeBudgetReached) for (let index = 0; index < scanSteps; index += 1) {
				if (now() >= effectiveDeadline) {
					timeBudgetReached = true;
					break;
				}
				maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
				requestedSteps = Math.max(requestedSteps, Math.ceil(maximumScroll / step) + 1);
				scanSteps = Math.min(maxSteps, Math.max(scanSteps, requestedSteps));
				const top = scanSteps === 1 ? maximumScroll : Math.round(maximumScroll * index / (scanSteps - 1));
				window.scrollTo(originalX, top);
				completedSteps += 1;
				refreshCollectionWhenChanged();
				if (now() >= effectiveDeadline) {
					timeBudgetReached = true;
					break;
				}
				const remainingSettleBudget = Math.max(0, effectiveDeadline - now());
				await wait(Math.min(settleMilliseconds, remainingSettleBudget));
				refreshCollectionWhenChanged();
				const nextDiscoverySignature = sourceDiscoverySignature();
				stableScans = nextDiscoverySignature === discoverySignature ? stableScans + 1 : 0;
				discoverySignature = nextDiscoverySignature;
				if (completedSteps >= minimumScanSteps && stableScans >= stableScanLimit) break;
				if (now() >= effectiveDeadline) {
					timeBudgetReached = true;
					break;
				}
			}
		} finally {
			window.scrollTo(originalX, originalY);
		}
		if (timeBudgetReached) warnings.push("LAZY_SCAN_TIME_BUDGET_REACHED");
		if (requestedSteps > maxSteps && completedSteps >= maxSteps) warnings.push("LAZY_SCAN_STEP_LIMIT_REACHED");
		const acceptedSources = new Set(discoveredImages.keys());
		latestCollection.diagnostics.total_images = document.images.length;
		latestCollection.diagnostics.accepted_images = discoveredImages.size;
		latestCollection.diagnostics.rejected = latestCollection.diagnostics.rejected.filter((diagnostic) => diagnostic.reasons.includes("DUPLICATE_SOURCE") || !acceptedSources.has(isHttpUrl(diagnostic.source) ? new URL(diagnostic.source, document.baseURI).href : diagnostic.source));
		return {
			images: [...discoveredImages.values()],
			diagnostics: latestCollection.diagnostics,
			warnings
		};
	}
	//#endregion
	//#region node_modules/.pnpm/preact@10.29.7/node_modules/preact/dist/preact.module.js
	var n;
	var l$1;
	var u$2;
	var i$2;
	var r$1;
	var o$1;
	var e$1;
	var f$2;
	var c$1;
	var a$1;
	var s$1;
	var h;
	var p$1;
	var v$1;
	var d$1 = {};
	var w$1 = [];
	var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
	var g = Array.isArray;
	function m$1(n, l) {
		for (var u in l) n[u] = l[u];
		return n;
	}
	function b(n) {
		n && n.parentNode && n.parentNode.removeChild(n);
	}
	function k$1(l, u, t) {
		var i, r, o, e = {};
		for (o in u) "key" == o ? i = u[o] : "ref" == o ? r = u[o] : e[o] = u[o];
		if (arguments.length > 2 && (e.children = arguments.length > 3 ? n.call(arguments, 2) : t), "function" == typeof l && null != l.defaultProps) for (o in l.defaultProps) void 0 === e[o] && (e[o] = l.defaultProps[o]);
		return x(l, e, i, r, null);
	}
	function x(n, t, i, r, o) {
		var e = {
			type: n,
			props: t,
			key: i,
			ref: r,
			__k: null,
			__: null,
			__b: 0,
			__e: null,
			__c: null,
			constructor: void 0,
			__v: null == o ? ++u$2 : o,
			__i: -1,
			__u: 0
		};
		return null == o && null != l$1.vnode && l$1.vnode(e), e;
	}
	function S(n) {
		return n.children;
	}
	function C(n, l) {
		this.props = n, this.context = l;
	}
	function $(n, l) {
		if (null == l) return n.__ ? $(n.__, n.__i + 1) : null;
		for (var u; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) return u.__e;
		return "function" == typeof n.type ? $(n) : null;
	}
	function I(n) {
		if (n.__P && n.__d) {
			var u = n.__v, t = u.__e, i = [], r = [], o = m$1({}, u);
			o.__v = u.__v + 1, l$1.vnode && l$1.vnode(o), q(n.__P, o, u, n.__n, n.__P.namespaceURI, 32 & u.__u ? [t] : null, i, null == t ? $(u) : t, !!(32 & u.__u), r), o.__v = u.__v, o.__.__k[o.__i] = o, D$1(i, o, r), u.__e = u.__ = null, o.__e != t && P(o);
		}
	}
	function P(n) {
		if (null != (n = n.__) && null != n.__c) return n.__e = n.__c.base = null, n.__k.some(function(l) {
			if (null != l && null != l.__e) return n.__e = n.__c.base = l.__e;
		}), P(n);
	}
	function A(n) {
		(!n.__d && (n.__d = !0) && i$2.push(n) && !H.__r++ || r$1 != l$1.debounceRendering) && ((r$1 = l$1.debounceRendering) || o$1)(H);
	}
	function H() {
		try {
			for (var n, l = 1; i$2.length;) i$2.length > l && i$2.sort(e$1), n = i$2.shift(), l = i$2.length, I(n);
		} finally {
			i$2.length = H.__r = 0;
		}
	}
	function L(n, l, u, t, i, r, o, e, f, c, a) {
		var s, h, p, v, y, _, g, m = t && t.__k || w$1, b = l.length;
		for (f = T(u, l, m, f, b), s = 0; s < b; s++) null != (p = u.__k[s]) && (h = -1 != p.__i && m[p.__i] || d$1, p.__i = s, _ = q(n, p, h, i, r, o, e, f, c, a), v = p.__e, p.ref && h.ref != p.ref && (h.ref && J(h.ref, null, p), a.push(p.ref, p.__c || v, p)), null == y && null != v && (y = v), (g = !!(4 & p.__u)) || h.__k === p.__k ? (f = j$1(p, f, n, g), g && h.__e && (h.__e = null)) : "function" == typeof p.type && void 0 !== _ ? f = _ : v && (f = v.nextSibling), p.__u &= -7);
		return u.__e = y, f;
	}
	function T(n, l, u, t, i) {
		var r, o, e, f, c, a = u.length, s = a, h = 0;
		for (n.__k = new Array(i), r = 0; r < i; r++) null != (o = l[r]) && "boolean" != typeof o && "function" != typeof o ? ("string" == typeof o || "number" == typeof o || "bigint" == typeof o || o.constructor == String ? o = n.__k[r] = x(null, o, null, null, null) : g(o) ? o = n.__k[r] = x(S, { children: o }, null, null, null) : void 0 === o.constructor && o.__b > 0 ? o = n.__k[r] = x(o.type, o.props, o.key, o.ref ? o.ref : null, o.__v) : n.__k[r] = o, f = r + h, o.__ = n, o.__b = n.__b + 1, e = null, -1 != (c = o.__i = O(o, u, f, s)) && (s--, (e = u[c]) && (e.__u |= 2)), null == e || null == e.__v ? (-1 == c && (i > a ? h-- : i < a && h++), "function" != typeof o.type && (o.__u |= 4)) : c != f && (c == f - 1 ? h-- : c == f + 1 ? h++ : (c > f ? h-- : h++, o.__u |= 4))) : n.__k[r] = null;
		if (s) for (r = 0; r < a; r++) null != (e = u[r]) && 0 == (2 & e.__u) && (e.__e == t && (t = $(e)), K(e, e));
		return t;
	}
	function j$1(n, l, u, t) {
		var i, r;
		if ("function" == typeof n.type) {
			for (i = n.__k, r = 0; i && r < i.length; r++) i[r] && (i[r].__ = n, l = j$1(i[r], l, u, t));
			return l;
		}
		n.__e != l && (t && (l && n.type && !l.parentNode && (l = $(n)), u.insertBefore(n.__e, l || null)), l = n.__e);
		do
			l = l && l.nextSibling;
		while (null != l && 8 == l.nodeType);
		return l;
	}
	function O(n, l, u, t) {
		var i, r, o, e = n.key, f = n.type, c = l[u], a = null != c && 0 == (2 & c.__u);
		if (null === c && null == e || a && e == c.key && f == c.type) return u;
		if (t > (a ? 1 : 0)) {
			for (i = u - 1, r = u + 1; i >= 0 || r < l.length;) if (null != (c = l[o = i >= 0 ? i-- : r++]) && 0 == (2 & c.__u) && e == c.key && f == c.type) return o;
		}
		return -1;
	}
	function z$1(n, l, u) {
		"-" == l[0] ? n.setProperty(l, null == u ? "" : u) : n[l] = null == u ? "" : "number" != typeof u || _.test(l) ? u : u + "px";
	}
	function N(n, l, u, t, i) {
		var r, o;
		n: if ("style" == l) if ("string" == typeof u) n.style.cssText = u;
		else {
			if ("string" == typeof t && (n.style.cssText = t = ""), t) for (l in t) u && l in u || z$1(n.style, l, "");
			if (u) for (l in u) t && u[l] == t[l] || z$1(n.style, l, u[l]);
		}
		else if ("o" == l[0] && "n" == l[1]) r = l != (l = l.replace(s$1, "$1")), o = l.toLowerCase(), l = o in n || "onFocusOut" == l || "onFocusIn" == l ? o.slice(2) : l.slice(2), n.l || (n.l = {}), n.l[l + r] = u, u ? t ? u[a$1] = t[a$1] : (u[a$1] = h, n.addEventListener(l, r ? v$1 : p$1, r)) : n.removeEventListener(l, r ? v$1 : p$1, r);
		else {
			if ("http://www.w3.org/2000/svg" == i) l = l.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
			else if ("width" != l && "height" != l && "href" != l && "list" != l && "form" != l && "tabIndex" != l && "download" != l && "rowSpan" != l && "colSpan" != l && "role" != l && "popover" != l && l in n) try {
				n[l] = null == u ? "" : u;
				break n;
			} catch (n) {}
			"function" == typeof u || (null == u || !1 === u && "-" != l[4] ? n.removeAttribute(l) : n.setAttribute(l, "popover" == l && 1 == u ? "" : u));
		}
	}
	function V(n) {
		return function(u) {
			if (this.l) {
				var t = this.l[u.type + n];
				if (null == u[c$1]) u[c$1] = h++;
				else if (u[c$1] < t[a$1]) return;
				return t(l$1.event ? l$1.event(u) : u);
			}
		};
	}
	function q(n, u, t, i, r, o, e, f, c, a) {
		var s, h, p, v, y, d, _, k, x, M, $, I, P, A, H, T, j = u.type;
		if (void 0 !== u.constructor) return null;
		128 & t.__u && (c = !!(32 & t.__u), o = [f = u.__e = t.__e]), (s = l$1.__b) && s(u);
		n: if ("function" == typeof j) {
			h = e.length;
			try {
				if (x = u.props, M = j.prototype && j.prototype.render, $ = (s = j.contextType) && i[s.__c], I = s ? $ ? $.props.value : s.__ : i, t.__c ? k = (p = u.__c = t.__c).__ = p.__E : (M ? u.__c = p = new j(x, I) : (u.__c = p = new C(x, I), p.constructor = j, p.render = Q), $ && $.sub(p), p.state || (p.state = {}), p.__n = i, v = p.__d = !0, p.__h = [], p._sb = []), M && null == p.__s && (p.__s = p.state), M && null != j.getDerivedStateFromProps && (p.__s == p.state && (p.__s = m$1({}, p.__s)), m$1(p.__s, j.getDerivedStateFromProps(x, p.__s))), y = p.props, d = p.state, p.__v = u, v) M && null == j.getDerivedStateFromProps && null != p.componentWillMount && p.componentWillMount(), M && null != p.componentDidMount && p.__h.push(p.componentDidMount);
				else {
					if (M && null == j.getDerivedStateFromProps && x !== y && null != p.componentWillReceiveProps && p.componentWillReceiveProps(x, I), u.__v == t.__v || !p.__e && null != p.shouldComponentUpdate && !1 === p.shouldComponentUpdate(x, p.__s, I)) {
						u.__v != t.__v && (p.props = x, p.state = p.__s, p.__d = !1), u.__e = t.__e, u.__k = t.__k, u.__k.some(function(n) {
							n && (n.__ = u);
						}), w$1.push.apply(p.__h, p._sb), p._sb = [], p.__h.length && e.push(p);
						break n;
					}
					null != p.componentWillUpdate && p.componentWillUpdate(x, p.__s, I), M && null != p.componentDidUpdate && p.__h.push(function() {
						p.componentDidUpdate(y, d, _);
					});
				}
				if (p.context = I, p.props = x, p.__P = n, p.__e = !1, P = l$1.__r, A = 0, M) p.state = p.__s, p.__d = !1, P && P(u), s = p.render(p.props, p.state, p.context), w$1.push.apply(p.__h, p._sb), p._sb = [];
				else do
					p.__d = !1, P && P(u), s = p.render(p.props, p.state, p.context), p.state = p.__s;
				while (p.__d && ++A < 25);
				p.state = p.__s, null != p.getChildContext && (i = m$1(m$1({}, i), p.getChildContext())), M && !v && null != p.getSnapshotBeforeUpdate && (_ = p.getSnapshotBeforeUpdate(y, d)), H = null != s && s.type === S && null == s.key ? E(s.props.children) : s, f = L(n, g(H) ? H : [H], u, t, i, r, o, e, f, c, a), p.base = u.__e, u.__u &= -161, p.__h.length && e.push(p), k && (p.__E = p.__ = null);
			} catch (n) {
				if (e.length = h, u.__v = null, c || null != o) {
					if (n.then) {
						for (u.__u |= c ? 160 : 128; f && 8 == f.nodeType && f.nextSibling;) f = f.nextSibling;
						null != o && (o[o.indexOf(f)] = null), u.__e = f;
					} else if (null != o) for (T = o.length; T--;) b(o[T]);
				} else u.__e = t.__e;
				u.__k ??= t.__k || [], n.then || B$1(u), l$1.__e(n, u, t);
			}
		} else null == o && u.__v == t.__v ? (u.__k = t.__k, u.__e = t.__e) : f = u.__e = G(t.__e, u, t, i, r, o, e, c, a);
		return (s = l$1.diffed) && s(u), 128 & u.__u ? void 0 : f;
	}
	function B$1(n) {
		n && (n.__c && (n.__c.__e = !0), n.__k && n.__k.some(B$1));
	}
	function D$1(n, u, t) {
		for (var i = 0; i < t.length; i++) J(t[i], t[++i], t[++i]);
		l$1.__c && l$1.__c(u, n), n.some(function(u) {
			try {
				n = u.__h, u.__h = [], n.some(function(n) {
					n.call(u);
				});
			} catch (n) {
				l$1.__e(n, u.__v);
			}
		});
	}
	function E(n) {
		return "object" != typeof n || null == n || n.__b > 0 ? n : g(n) ? n.map(E) : void 0 !== n.constructor ? null : m$1({}, n);
	}
	function G(u, t, i, r, o, e, f, c, a) {
		var s, h, p, v, y, w, _, m = i.props || d$1, k = t.props, x = t.type;
		if ("svg" == x ? o = "http://www.w3.org/2000/svg" : "math" == x ? o = "http://www.w3.org/1998/Math/MathML" : o || (o = "http://www.w3.org/1999/xhtml"), null != e) {
			for (s = 0; s < e.length; s++) if ((y = e[s]) && "setAttribute" in y == !!x && (x ? y.localName == x : 3 == y.nodeType)) {
				u = y, e[s] = null;
				break;
			}
		}
		if (null == u) {
			if (null == x) return document.createTextNode(k);
			u = document.createElementNS(o, x, k.is && k), c && (l$1.__m && l$1.__m(t, e), c = !1), e = null;
		}
		if (null == x) m === k || c && u.data == k || (u.data = k);
		else {
			if (e = "textarea" == x && null != k.defaultValue ? null : e && n.call(u.childNodes), !c && null != e) for (m = {}, s = 0; s < u.attributes.length; s++) m[(y = u.attributes[s]).name] = y.value;
			for (s in m) y = m[s], "dangerouslySetInnerHTML" == s ? p = y : "children" == s || s in k || "value" == s && "defaultValue" in k || "checked" == s && "defaultChecked" in k || N(u, s, null, y, o);
			for (s in k) y = k[s], "children" == s ? v = y : "dangerouslySetInnerHTML" == s ? h = y : "value" == s ? w = y : "checked" == s ? _ = y : c && "function" != typeof y || m[s] === y || N(u, s, y, m[s], o);
			if (h) c || p && (h.__html == p.__html || h.__html == u.innerHTML) || (u.innerHTML = h.__html), t.__k = [];
			else if (p && (u.innerHTML = ""), L("template" == t.type ? u.content : u, g(v) ? v : [v], t, i, r, "foreignObject" == x ? "http://www.w3.org/1999/xhtml" : o, e, f, e ? e[0] : i.__k && $(i, 0), c, a), null != e) for (s = e.length; s--;) b(e[s]);
			c && "textarea" != x || (s = "value", "progress" == x && null == w ? u.removeAttribute("value") : null != w && (w !== u[s] || "progress" == x && !w || "option" == x && w != m[s]) && N(u, s, w, m[s], o), s = "checked", null != _ && _ != u[s] && N(u, s, _, m[s], o));
		}
		return u;
	}
	function J(n, u, t) {
		try {
			if ("function" == typeof n) {
				var i = "function" == typeof n.__u;
				i && n.__u(), i && null == u || (n.__u = n(u));
			} else n.current = u;
		} catch (n) {
			l$1.__e(n, t);
		}
	}
	function K(n, u, t) {
		var i, r;
		if (l$1.unmount && l$1.unmount(n), (i = n.ref) && (i.current && i.current != n.__e || J(i, null, u)), null != (i = n.__c)) {
			if (i.componentWillUnmount) try {
				i.componentWillUnmount();
			} catch (n) {
				l$1.__e(n, u);
			}
			i.base = i.__P = i.__n = null;
		}
		if (i = n.__k) for (r = 0; r < i.length; r++) i[r] && K(i[r], u, t || "function" != typeof n.type);
		t || b(n.__e), n.__c = n.__ = n.__e = void 0;
	}
	function Q(n, l, u) {
		return this.constructor(n, u);
	}
	function R(u, t, i) {
		var r, o, e, f;
		t == document && (t = document.documentElement), l$1.__ && l$1.__(u, t), o = (r = "function" == typeof i) ? null : i && i.__k || t.__k, e = [], f = [], q(t, u = (!r && i || t).__k = k$1(S, null, [u]), o || d$1, d$1, t.namespaceURI, !r && i ? [i] : o ? null : t.firstChild ? n.call(t.childNodes) : null, e, !r && i ? i : o ? o.__e : t.firstChild, r, f), D$1(e, u, f), u.props.children = null;
	}
	n = w$1.slice, l$1 = { __e: function(n, l, u, t) {
		for (var i, r, o; l = l.__;) if ((i = l.__c) && !i.__) try {
			if ((r = i.constructor) && null != r.getDerivedStateFromError && (i.setState(r.getDerivedStateFromError(n)), o = i.__d), null != i.componentDidCatch && (i.componentDidCatch(n, t || {}), o = i.__d), o) return i.__E = i;
		} catch (l) {
			n = l;
		}
		throw n;
	} }, u$2 = 0, C.prototype.setState = function(n, l) {
		var u = null != this.__s && this.__s != this.state ? this.__s : this.__s = m$1({}, this.state);
		"function" == typeof n && (n = n(m$1({}, u), this.props)), n && m$1(u, n), null != n && this.__v && (l && this._sb.push(l), A(this));
	}, C.prototype.forceUpdate = function(n) {
		this.__v && (this.__e = !0, n && this.__h.push(n), A(this));
	}, C.prototype.render = S, i$2 = [], o$1 = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e$1 = function(n, l) {
		return n.__v.__b - l.__v.__b;
	}, H.__r = 0, f$2 = Math.random().toString(8), c$1 = "__d" + f$2, a$1 = "__a" + f$2, s$1 = /(PointerCapture)$|Capture$/i, h = 0, p$1 = V(!1), v$1 = V(!0);
	//#endregion
	//#region apps/shortcut-client/src/shared/control-requests.ts
	var CANCEL_REQUESTED_KEY = "__penguinTranslatorCancelRequested";
	var RETRY_REQUESTED_KEY = "__penguinTranslatorRetryRequested";
	function readControlRequests() {
		const retryValue = Reflect.get(window, RETRY_REQUESTED_KEY);
		return {
			cancelRequested: Reflect.get(window, CANCEL_REQUESTED_KEY) === true,
			retryRequested: Array.isArray(retryValue) ? retryValue.filter((value) => typeof value === "string" && value.length > 0) : []
		};
	}
	function consumeControlRequests() {
		const requests = readControlRequests();
		Reflect.deleteProperty(window, CANCEL_REQUESTED_KEY);
		Reflect.deleteProperty(window, RETRY_REQUESTED_KEY);
		return requests;
	}
	function requestCancellation() {
		Reflect.set(window, CANCEL_REQUESTED_KEY, true);
	}
	function requestFailureRetry(clientImageIds) {
		Reflect.set(window, RETRY_REQUESTED_KEY, [...clientImageIds]);
	}
	//#endregion
	//#region node_modules/.pnpm/preact@10.29.7/node_modules/preact/hooks/dist/hooks.module.js
	var t;
	var r;
	var u$1;
	var i$1;
	var o = 0;
	var f$1 = [];
	var c = l$1;
	var e = c.__b;
	var a = c.__r;
	var v = c.diffed;
	var l = c.__c;
	var m = c.unmount;
	var p = c.__;
	function s(n, t) {
		c.__h && c.__h(r, n, o || t), o = 0;
		var u = r.__H || (r.__H = {
			__: [],
			__h: []
		});
		return n >= u.__.length && u.__.push({}), u.__[n];
	}
	function d(n) {
		return o = 1, y(D, n);
	}
	function y(n, u, i) {
		var o = s(t++, 2);
		if (o.t = n, !o.__c && (o.__ = [i ? i(u) : D(void 0, u), function(n) {
			var t = o.__N ? o.__N[0] : o.__[0], r = o.t(t, n);
			t !== r && (o.__N = [r, o.__[1]], o.__c.setState({}));
		}], o.__c = r, !r.__f)) {
			var f = function(n, t, r) {
				if (!o.__c.__H) return !0;
				var u = !1, i = o.__c.props !== n;
				if (o.__c.__H.__.some(function(n) {
					if (n.__N) {
						u = !0;
						var t = n.__[0];
						n.__ = n.__N, n.__N = void 0, t !== n.__[0] && (i = !0);
					}
				}), c) {
					var f = c.call(this, n, t, r);
					return u ? f || i : f;
				}
				return !u || i;
			};
			r.__f = !0;
			var c = r.shouldComponentUpdate, e = r.componentWillUpdate;
			r.componentWillUpdate = function(n, t, r) {
				if (this.__e) {
					var u = c;
					c = void 0, f(n, t, r), c = u;
				}
				e && e.call(this, n, t, r);
			}, r.shouldComponentUpdate = f;
		}
		return o.__N || o.__;
	}
	function j() {
		for (var n; n = f$1.shift();) {
			var t = n.__H;
			if (n.__P && t) try {
				t.__h.some(z), t.__h.some(B), t.__h = [];
			} catch (r) {
				t.__h = [], c.__e(r, n.__v);
			}
		}
	}
	c.__b = function(n) {
		r = null, e && e(n);
	}, c.__ = function(n, t) {
		n && t.__k && t.__k.__m && (n.__m = t.__k.__m), p && p(n, t);
	}, c.__r = function(n) {
		a && a(n), t = 0;
		var i = (r = n.__c).__H;
		i && (u$1 === r ? (i.__h = [], r.__h = [], i.__.some(function(n) {
			n.__N && (n.__ = n.__N), n.u = n.__N = void 0;
		})) : (i.__h.some(z), i.__h.some(B), i.__h = [], t = 0)), u$1 = r;
	}, c.diffed = function(n) {
		v && v(n);
		var t = n.__c;
		t && t.__H && (t.__H.__h.length && (1 !== f$1.push(t) && i$1 === c.requestAnimationFrame || ((i$1 = c.requestAnimationFrame) || w)(j)), t.__H.__.some(function(n) {
			n.u && (n.__H = n.u, n.u = void 0);
		})), u$1 = r = null;
	}, c.__c = function(n, t) {
		t.some(function(n) {
			try {
				n.__h.some(z), n.__h = n.__h.filter(function(n) {
					return !n.__ || B(n);
				});
			} catch (r) {
				t.some(function(n) {
					n.__h && (n.__h = []);
				}), t = [], c.__e(r, n.__v);
			}
		}), l && l(n, t);
	}, c.unmount = function(n) {
		m && m(n);
		var t, r = n.__c;
		r && r.__H && (r.__H.__.some(function(n) {
			try {
				z(n);
			} catch (n) {
				t = n;
			}
		}), r.__H = void 0, t && c.__e(t, r.__v));
	};
	var k = "function" == typeof requestAnimationFrame;
	function w(n) {
		var t, r = function() {
			clearTimeout(u), k && cancelAnimationFrame(t), setTimeout(n);
		}, u = setTimeout(r, 35);
		k && (t = requestAnimationFrame(r));
	}
	function z(n) {
		var t = r, u = n.__c;
		"function" == typeof u && (n.__c = void 0, u()), r = t;
	}
	function B(n) {
		var t = r;
		n.__c = n.__(), r = t;
	}
	function D(n, t) {
		return "function" == typeof t ? t(n) : t;
	}
	//#endregion
	//#region node_modules/.pnpm/preact@10.29.7/node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
	var f = 0;
	Array.isArray;
	function u(e, t, n, o, i, u) {
		t || (t = {});
		var a, c, p = t;
		if ("ref" in p) for (c in p = {}, t) "ref" == c ? a = t[c] : p[c] = t[c];
		var l = {
			type: e,
			props: p,
			key: n,
			ref: a,
			__k: null,
			__: null,
			__b: 0,
			__e: null,
			__c: null,
			constructor: void 0,
			__v: --f,
			__i: -1,
			__u: 0,
			__source: i,
			__self: u
		};
		if ("function" == typeof e && (a = e.defaultProps)) for (c in a) void 0 === p[c] && (p[c] = a[c]);
		return l$1.vnode && l$1.vnode(l), l;
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/control-panel.tsx
	function setRegionsVisible(visible) {
		for (const region of document.querySelectorAll("[data-penguin-translator-region]")) region.style.display = visible ? "flex" : "none";
	}
	function ControlPanel({ onRemove, onTextModeChange, onCancel, onRetryFailures, progress, timingLabel }) {
		const [visible, setVisible] = d(true);
		const [textMode, setTextMode] = d("translation");
		const [cancelled, setCancelled] = d(false);
		return /* @__PURE__ */ u("div", {
			class: "panel",
			children: [
				/* @__PURE__ */ u("strong", { children: "企鵝翻譯機 M2" }),
				/* @__PURE__ */ u("span", {
					class: "progress",
					"aria-live": "polite",
					children: [cancelled ? "已取消" : progress.completed >= progress.total ? `完成 ${progress.completed} / ${progress.total}` : `正在翻譯 ${progress.completed} / ${progress.total}`, ` · 成功 ${progress.successful} · 失敗 ${progress.failed}`]
				}),
				timingLabel ? /* @__PURE__ */ u("span", {
					class: "timing",
					children: timingLabel
				}) : null,
				/* @__PURE__ */ u("button", {
					type: "button",
					onClick: () => {
						const next = !visible;
						setVisible(next);
						setRegionsVisible(next);
					},
					children: visible ? "隱藏譯文" : "顯示譯文"
				}),
				/* @__PURE__ */ u("button", {
					type: "button",
					onClick: () => {
						const next = textMode === "translation" ? "source" : "translation";
						setTextMode(next);
						onTextModeChange(next);
					},
					children: textMode === "translation" ? "顯示原文" : "顯示譯文"
				}),
				progress.completed < progress.total && !cancelled ? /* @__PURE__ */ u("button", {
					type: "button",
					onClick: () => {
						setCancelled(true);
						onCancel();
					},
					children: "取消"
				}) : null,
				progress.failed > 0 ? /* @__PURE__ */ u("button", {
					type: "button",
					onClick: onRetryFailures,
					children: "重試失敗圖片"
				}) : null,
				/* @__PURE__ */ u("button", {
					type: "button",
					onClick: onRemove,
					children: "移除全部"
				})
			]
		});
	}
	var CONTROL_PANEL_STYLE = `
  :host { all: initial; }
  .panel {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: flex;
    flex-wrap: wrap;
    max-width: min(92vw, 560px);
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.96);
    color: white;
    font: 14px/1.2 system-ui, sans-serif;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
  }
  .progress { white-space: nowrap; }
  .timing { white-space: nowrap; color: #cbd5e1; }
  button {
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
  }
`;
	//#endregion
	//#region apps/shortcut-client/src/renderer/coordinate-mapper.ts
	function mapPolygonToDocument(image, polygon, sourceWidth, sourceHeight, imageRect) {
		if (polygon.length !== 4 || sourceWidth <= 0 || sourceHeight <= 0) throw new Error("A four-point polygon and positive source dimensions are required.");
		const rect = imageRect ?? image.getBoundingClientRect();
		const xs = polygon.map(([x]) => x);
		const ys = polygon.map(([, y]) => y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const scaleX = rect.width / sourceWidth;
		const scaleY = rect.height / sourceHeight;
		return {
			left: window.scrollX + rect.left + minX * scaleX,
			top: window.scrollY + rect.top + minY * scaleY,
			width: (maxX - minX) * scaleX,
			height: (maxY - minY) * scaleY
		};
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/region-style.ts
	function classifyBackgroundPixels(pixels) {
		if (pixels.length < 4) return "translucent";
		let count = 0;
		let whitePixels = 0;
		for (let index = 0; index + 3 < pixels.length; index += 4) {
			if (pixels[index + 3] === 0) continue;
			const red = pixels[index] ?? 0;
			const green = pixels[index + 1] ?? 0;
			const blue = pixels[index + 2] ?? 0;
			const minimum = Math.min(red, green, blue);
			if (minimum >= 225 && Math.max(red, green, blue) - minimum <= 24) whitePixels += 1;
			count += 1;
		}
		if (count === 0) return "translucent";
		return whitePixels / count >= .72 ? "opaque" : "translucent";
	}
	function detectRegionBackground(image, polygon) {
		try {
			const xs = polygon.map(([x]) => x);
			const ys = polygon.map(([, y]) => y);
			const polygonLeft = Math.max(0, Math.min(...xs));
			const polygonTop = Math.max(0, Math.min(...ys));
			const polygonWidth = Math.max(1, Math.max(...xs) - polygonLeft);
			const polygonHeight = Math.max(1, Math.max(...ys) - polygonTop);
			const padding = Math.max(3, Math.round(Math.min(polygonWidth, polygonHeight) * .12));
			const left = Math.max(0, polygonLeft - padding);
			const top = Math.max(0, polygonTop - padding);
			const width = Math.min(image.naturalWidth - left, polygonWidth + padding * 2);
			const height = Math.min(image.naturalHeight - top, polygonHeight + padding * 2);
			const canvas = document.createElement("canvas");
			canvas.width = 32;
			canvas.height = 32;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) return "translucent";
			context.drawImage(image, left, top, width, height, 0, 0, 32, 32);
			const sampled = context.getImageData(0, 0, 32, 32).data;
			const perimeter = [];
			for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
				if (x >= 6 && x < 26 && y >= 6 && y < 26) continue;
				const offset = (y * 32 + x) * 4;
				perimeter.push(sampled[offset] ?? 0, sampled[offset + 1] ?? 0, sampled[offset + 2] ?? 0, sampled[offset + 3] ?? 0);
			}
			return classifyBackgroundPixels(new Uint8ClampedArray(perimeter));
		} catch {
			return "translucent";
		}
	}
	function estimatedHeight(text, width, fontSize, padding) {
		const usableWidth = Math.max(1, width - padding * 2);
		const charactersPerLine = Math.max(1, Math.floor(usableWidth / (fontSize * .9)));
		const visualCharacters = Array.from(text).length;
		return Math.max(1, Math.ceil(visualCharacters / charactersPerLine)) * fontSize * 1.25 + padding * 2;
	}
	function fitRegionLayout(position, text) {
		const padding = 8;
		const originalHeight = Math.max(1, position.height);
		for (let fontSize = Math.min(24, Math.max(12, position.height * .42)); fontSize >= 8; fontSize -= 1) if (estimatedHeight(text, position.width, fontSize, padding) <= originalHeight) return {
			height: originalHeight,
			fontSize
		};
		return {
			height: Math.min(Math.max(originalHeight + 24, originalHeight * 1.25), Math.max(originalHeight, estimatedHeight(text, position.width, 8, padding))),
			fontSize: 8
		};
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/overlay-layout.ts
	function overlapArea(left, right) {
		return Math.max(0, Math.min(left.position.left + left.position.width, right.position.left + right.position.width) - Math.max(left.position.left, right.position.left)) * Math.max(0, Math.min(left.position.top + left.position.height, right.position.top + right.position.height) - Math.max(left.position.top, right.position.top));
	}
	function isDuplicate(left, right) {
		const leftArea = Math.max(1, left.position.width * left.position.height);
		const rightArea = Math.max(1, right.position.width * right.position.height);
		return left.translatedText.trim() === right.translatedText.trim() && left.sourceText.trim() === right.sourceText.trim() && overlapArea(left, right) / Math.min(leftArea, rightArea) >= .82;
	}
	function collides(candidate, placed) {
		return placed.some((region) => overlapArea(candidate, region) > 4);
	}
	function layoutOverlayRegions(input, bounds) {
		const placed = [];
		const sorted = [...input].sort((left, right) => left.position.top - right.position.top || left.position.left - right.position.left);
		for (const region of sorted) {
			if (placed.some((candidate) => isDuplicate(candidate, region))) continue;
			const fitted = fitRegionLayout(region.position, region.translatedText);
			const width = Math.min(region.position.width, Math.max(1, bounds.right - bounds.left));
			const height = Math.min(fitted.height, Math.max(1, bounds.bottom - bounds.top));
			const centeredTop = region.position.top - (height - region.position.height) / 2;
			const base = {
				...region,
				position: {
					left: Math.min(Math.max(region.position.left, bounds.left), bounds.right - width),
					top: Math.min(Math.max(centeredTop, bounds.top), bounds.bottom - height),
					width,
					height
				}
			};
			if (!collides(base, placed)) {
				placed.push(base);
				continue;
			}
			const gap = 4;
			const latestBottom = Math.max(...placed.map((candidate) => candidate.position.top + candidate.position.height));
			const below = {
				...base,
				position: {
					...base.position,
					top: latestBottom + gap
				}
			};
			if (below.position.top + height <= bounds.bottom && !collides(below, placed)) {
				placed.push(below);
				continue;
			}
			const earliestTop = Math.min(...placed.map((candidate) => candidate.position.top));
			const above = {
				...base,
				position: {
					...base.position,
					top: earliestTop - height - gap
				}
			};
			if (above.position.top >= bounds.top && !collides(above, placed)) placed.push(above);
		}
		return placed;
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/translation-region.tsx
	function TranslationRegion({ position, text, backgroundMode }) {
		const layout = fitRegionLayout(position, text);
		return /* @__PURE__ */ u("div", {
			"data-penguin-translator-region": "true",
			"data-penguin-translator-background": backgroundMode,
			style: {
				position: "absolute",
				boxSizing: "border-box",
				left: `${position.left}px`,
				top: `${position.top}px`,
				width: `${position.width}px`,
				height: `${layout.height}px`,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				overflow: "hidden",
				padding: "8px",
				border: "1px solid rgba(30, 41, 59, 0.18)",
				borderRadius: "4px",
				background: backgroundMode === "opaque" ? "rgb(255, 255, 255)" : "rgba(248, 250, 252, 0.96)",
				color: "#0f172a",
				fontFamily: "system-ui, sans-serif",
				fontSize: `${layout.fontSize}px`,
				lineHeight: 1.25,
				textAlign: "center",
				whiteSpace: "pre-wrap",
				overflowWrap: "anywhere",
				wordBreak: "break-word",
				writingMode: "horizontal-tb",
				pointerEvents: "auto"
			},
			children: text
		});
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/overlay-root.tsx
	function OverlayRoot({ regions, textMode }) {
		return /* @__PURE__ */ u(S, { children: regions.map((region) => /* @__PURE__ */ u(TranslationRegion, {
			position: region.position,
			text: textMode === "source" ? region.sourceText : region.translatedText,
			backgroundMode: region.backgroundMode
		}, region.key)) });
	}
	//#endregion
	//#region apps/shortcut-client/src/renderer/runtime.tsx
	var ROOT_ID = "penguin-translator-overlay-root";
	var PANEL_ID = "penguin-translator-control-host";
	var RENDERER_CLEANUP_KEY = "__penguinTranslatorM0RendererCleanup";
	var CANCEL_EVENT = "penguin-translator:cancel";
	var RETRY_FAILURES_EVENT = "penguin-translator:retry-failures";
	function nonNegativeInteger(value, fallback) {
		return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
	}
	function normalizeProgress(value, successful, failed) {
		const record = typeof value === "object" && value !== null ? value : {};
		const completedFallback = successful + failed;
		const total = nonNegativeInteger(record.total, completedFallback);
		const completed = Math.min(total, nonNegativeInteger(record.completed, completedFallback));
		return {
			total,
			completed,
			successful: Math.min(completed, nonNegativeInteger(record.successful, successful)),
			failed: Math.min(completed, nonNegativeInteger(record.failed, failed))
		};
	}
	function activeCleanup() {
		const cleanup = Reflect.get(window, RENDERER_CLEANUP_KEY);
		return typeof cleanup === "function" ? cleanup : void 0;
	}
	function removeExisting() {
		const cleanup = activeCleanup();
		if (cleanup) {
			cleanup();
			return;
		}
		document.getElementById(ROOT_ID)?.remove();
		document.getElementById(PANEL_ID)?.remove();
	}
	function mount(results, options = {}) {
		removeExisting();
		const overlay = document.createElement("div");
		overlay.id = ROOT_ID;
		overlay.dataset.penguinTranslatorRoot = "true";
		overlay.style.position = "absolute";
		overlay.style.inset = "0";
		overlay.style.zIndex = "2147483646";
		overlay.style.pointerEvents = "none";
		document.body.append(overlay);
		const panelHost = document.createElement("div");
		panelHost.id = PANEL_ID;
		panelHost.dataset.penguinTranslatorPanel = "true";
		const shadow = panelHost.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = CONTROL_PANEL_STYLE;
		shadow.append(style);
		const panelMount = document.createElement("div");
		shadow.append(panelMount);
		document.body.append(panelHost);
		const warnings = [];
		const matchedImages = /* @__PURE__ */ new Set();
		for (const result of results) {
			const image = findImageByClientId(result.client_image_id);
			if (image) matchedImages.add(image);
			else warnings.push(`IMAGE_NOT_FOUND:${result.client_image_id}`);
		}
		let animationFrame;
		let resizeObserver;
		let disposed = false;
		let textMode = "translation";
		const backgroundModes = /* @__PURE__ */ new Map();
		const progress = options.progress ?? normalizeProgress(void 0, results.length, 0);
		const failures = options.failures ?? [];
		const draw = () => {
			if (disposed) return;
			const regions = [];
			for (const result of results) {
				const image = findImageByClientId(result.client_image_id);
				if (!image) continue;
				const rect = image.getBoundingClientRect();
				const imageRegions = [];
				for (const region of result.regions) {
					const key = `${result.client_image_id}:${region.region_id}`;
					let backgroundMode = backgroundModes.get(key);
					if (!backgroundMode) {
						backgroundMode = "background_style" in region && (region.background_style === "opaque" || region.background_style === "translucent") ? region.background_style : detectRegionBackground(image, region.polygon);
						backgroundModes.set(key, backgroundMode);
					}
					imageRegions.push({
						key,
						position: mapPolygonToDocument(image, region.polygon, result.image_width, result.image_height, rect),
						sourceText: region.source_text,
						translatedText: region.translated_text,
						backgroundMode
					});
				}
				regions.push(...layoutOverlayRegions(imageRegions, {
					left: window.scrollX + rect.left,
					top: window.scrollY + rect.top,
					right: window.scrollX + rect.right,
					bottom: window.scrollY + rect.bottom
				}));
			}
			R(/* @__PURE__ */ u(OverlayRoot, {
				regions,
				textMode
			}), overlay);
		};
		const scheduleDraw = () => {
			if (disposed || animationFrame !== void 0) return;
			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = void 0;
				draw();
			});
		};
		const cleanup = () => {
			if (disposed) return;
			disposed = true;
			document.removeEventListener("scroll", scheduleDraw, true);
			window.removeEventListener("scroll", scheduleDraw);
			window.removeEventListener("resize", scheduleDraw);
			resizeObserver?.disconnect();
			if (animationFrame !== void 0) {
				window.cancelAnimationFrame(animationFrame);
				animationFrame = void 0;
			}
			R(null, overlay);
			R(null, panelMount);
			overlay.remove();
			panelHost.remove();
			if (activeCleanup() === cleanup) Reflect.deleteProperty(window, RENDERER_CLEANUP_KEY);
		};
		Reflect.set(window, RENDERER_CLEANUP_KEY, cleanup);
		try {
			draw();
			R(/* @__PURE__ */ u(ControlPanel, {
				onRemove: removeExisting,
				onTextModeChange: (mode) => {
					textMode = mode;
					draw();
				},
				onCancel: () => {
					requestCancellation();
					window.dispatchEvent(new CustomEvent(CANCEL_EVENT));
				},
				onRetryFailures: () => {
					requestFailureRetry(failures);
					window.dispatchEvent(new CustomEvent(RETRY_FAILURES_EVENT, { detail: { client_image_ids: failures } }));
				},
				progress,
				timingLabel: options.timingLabel
			}), panelMount);
			document.addEventListener("scroll", scheduleDraw, {
				capture: true,
				passive: true
			});
			window.addEventListener("scroll", scheduleDraw, { passive: true });
			window.addEventListener("resize", scheduleDraw, { passive: true });
			if (typeof window.ResizeObserver === "function") {
				resizeObserver = new window.ResizeObserver(scheduleDraw);
				for (const image of matchedImages) resizeObserver.observe(image);
			}
			return {
				renderedRegions: overlay.querySelectorAll("[data-penguin-translator-region]").length,
				warnings
			};
		} catch (error) {
			cleanup();
			throw error;
		}
	}
	//#endregion
	//#region apps/shortcut-client/src/shared/request-id.ts
	function createRequestId() {
		if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
		const bytes = /* @__PURE__ */ new Uint8Array(16);
		if (typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
		else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
		bytes[6] = (bytes[6] ?? 0) & 15 | 64;
		bytes[8] = (bytes[8] ?? 0) & 63 | 128;
		const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
		return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
	}
	//#endregion
	//#region apps/userscript/src/page-api.ts
	function safeApiError(status) {
		if (status === 401) return /* @__PURE__ */ new Error("LOCAL_API_TOKEN_INVALID");
		if (status === 413) return /* @__PURE__ */ new Error("PAGE_BATCH_TOO_LARGE");
		if (status === 422) return /* @__PURE__ */ new Error("PAGE_REQUEST_INVALID");
		if (status === 503) return /* @__PURE__ */ new Error("TRANSLATION_NOT_CONFIGURED");
		return /* @__PURE__ */ new Error(`PAGE_API_${status}`);
	}
	function isPageResponse(value) {
		if (typeof value !== "object" || value === null) return false;
		const record = value;
		return Array.isArray(record.results) && Array.isArray(record.failures) && typeof record.progress === "object" && record.progress !== null && typeof record.timing === "object" && record.timing !== null;
	}
	async function translatePage(gm, settings, request) {
		const response = await gm.xmlHttpRequest({
			url: settings.endpoint,
			method: "POST",
			headers: {
				Authorization: `Bearer ${settings.token}`,
				"Content-Type": "application/json"
			},
			data: JSON.stringify(request),
			responseType: "text",
			timeout: 3e5
		});
		if (response.status < 200 || response.status >= 300) throw safeApiError(response.status);
		let parsed;
		try {
			parsed = JSON.parse(response.responseText);
		} catch {
			throw new Error("PAGE_API_RESPONSE_INVALID");
		}
		if (!isPageResponse(parsed)) throw new Error("PAGE_API_RESPONSE_INVALID");
		return parsed;
	}
	//#endregion
	//#region apps/userscript/src/settings.ts
	var SETTINGS_KEYS = {
		endpoint: "penguin.apiEndpoint",
		token: "penguin.localApiToken",
		targetLanguage: "penguin.targetLanguage"
	};
	function normalizeApiEndpoint(value) {
		const parsed = new URL(value.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("API_ENDPOINT_PROTOCOL_INVALID");
		if (parsed.username || parsed.password) throw new Error("API_ENDPOINT_CREDENTIALS_INVALID");
		parsed.username = "";
		parsed.password = "";
		parsed.search = "";
		parsed.hash = "";
		const path = parsed.pathname.replace(/\/$/, "");
		parsed.pathname = path.endsWith("/v1/translate-page") ? path : `${path}/v1/translate-page`;
		return parsed.toString();
	}
	async function loadSettings(gm) {
		const [endpoint, token, targetLanguage] = await Promise.all([
			gm.getValue(SETTINGS_KEYS.endpoint, ""),
			gm.getValue(SETTINGS_KEYS.token, ""),
			gm.getValue(SETTINGS_KEYS.targetLanguage, "zh-Hant")
		]);
		return {
			endpoint: typeof endpoint === "string" ? endpoint : "",
			token: typeof token === "string" ? token : "",
			targetLanguage: targetLanguage === "zh-Hant" ? "zh-Hant" : "zh-Hant"
		};
	}
	async function saveSettings(gm, value) {
		const normalized = {
			endpoint: normalizeApiEndpoint(value.endpoint),
			token: value.token.trim(),
			targetLanguage: "zh-Hant"
		};
		if (!normalized.token) throw new Error("LOCAL_API_TOKEN_REQUIRED");
		await Promise.all([
			gm.setValue(SETTINGS_KEYS.endpoint, normalized.endpoint),
			gm.setValue(SETTINGS_KEYS.token, normalized.token),
			gm.setValue(SETTINGS_KEYS.targetLanguage, normalized.targetLanguage)
		]);
		return normalized;
	}
	async function deleteSettings(gm) {
		await Promise.all(Object.values(SETTINGS_KEYS).map((key) => gm.deleteValue(key)));
	}
	//#endregion
	//#region apps/userscript/src/shell.ts
	var SHELL_HOST_ID = "penguin-translator-userscript-shell";
	var HOST_STYLE = `
#${SHELL_HOST_ID} {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  right: 14px;
  bottom: 84px;
}
`;
	var SHADOW_STYLE = `
:host { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.launcher { display: flex; align-items: center; gap: 6px; }
button { border: 0; border-radius: 999px; padding: 11px 14px; background: #111827; color: #fff; font: 700 14px/1.2 inherit; box-shadow: 0 6px 20px rgba(0,0,0,.24); }
button:disabled { opacity: .65; }
.settings-button { width: 40px; height: 40px; padding: 0; background: #334155; }
.status { max-width: 230px; margin: 6px 0 0 auto; padding: 7px 10px; border-radius: 10px; background: rgba(15,23,42,.94); color: #fff; font: 600 12px/1.35 inherit; text-align: right; }
.panel { width: min(330px, calc(100vw - 28px)); margin-top: 8px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 14px; background: #fff; color: #0f172a; box-shadow: 0 12px 36px rgba(0,0,0,.3); }
.panel[hidden], .status[hidden] { display: none; }
h2 { margin: 0 0 10px; font: 750 17px/1.3 inherit; }
label { display: grid; gap: 5px; margin: 9px 0; font: 650 12px/1.3 inherit; }
input, select { box-sizing: border-box; width: 100%; border: 1px solid #94a3b8; border-radius: 8px; padding: 9px; background: #fff; color: #0f172a; font: 14px/1.3 inherit; }
.actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.actions button { border-radius: 8px; padding: 9px 11px; box-shadow: none; }
.secondary { background: #64748b; }
.danger { background: #991b1b; margin-right: auto; }
`;
	function element(root, tag, attributes = {}) {
		const value = document.createElement(tag);
		for (const [name, attribute] of Object.entries(attributes)) value.setAttribute(name, attribute);
		root.append(value);
		return value;
	}
	function buildShell(host) {
		const root = host.attachShadow({ mode: "open" });
		const style = element(root, "style");
		style.textContent = SHADOW_STYLE;
		const launcher = element(root, "div", { class: "launcher" });
		const translate = document.createElement("button");
		translate.type = "button";
		translate.textContent = "企鵝翻譯";
		translate.dataset.action = "translate";
		const settings = document.createElement("button");
		settings.type = "button";
		settings.textContent = "設定";
		settings.className = "settings-button";
		settings.dataset.action = "settings";
		launcher.append(translate, settings);
		const status = element(root, "output", {
			class: "status",
			hidden: ""
		});
		const panel = element(root, "section", {
			class: "panel",
			hidden: ""
		});
		const title = document.createElement("h2");
		title.textContent = "企鵝翻譯機設定";
		panel.append(title);
		const field = (labelText, control) => {
			const label = document.createElement("label");
			label.append(labelText, control);
			panel.append(label);
		};
		const endpoint = document.createElement("input");
		endpoint.type = "url";
		endpoint.inputMode = "url";
		endpoint.placeholder = "http://<WINDOWS_LAN_IPV4>:8000";
		endpoint.autocomplete = "off";
		endpoint.dataset.field = "endpoint";
		field("API Endpoint", endpoint);
		const token = document.createElement("input");
		token.type = "password";
		token.autocomplete = "off";
		token.spellcheck = false;
		token.dataset.field = "token";
		field("Local API Token", token);
		const target = document.createElement("select");
		target.dataset.field = "target-language";
		const targetOption = document.createElement("option");
		targetOption.value = "zh-Hant";
		targetOption.textContent = "繁體中文 (zh-Hant)";
		target.append(targetOption);
		field("Target Language", target);
		const actions = document.createElement("div");
		actions.className = "actions";
		const clear = document.createElement("button");
		clear.type = "button";
		clear.className = "danger";
		clear.textContent = "清除設定";
		clear.dataset.action = "clear-settings";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "secondary";
		cancel.textContent = "取消";
		cancel.dataset.action = "cancel-settings";
		const save = document.createElement("button");
		save.type = "button";
		save.textContent = "儲存";
		save.dataset.action = "save-settings";
		actions.append(clear, cancel, save);
		panel.append(actions);
		return {
			translate,
			settings,
			status,
			panel,
			endpoint,
			token,
			target,
			save,
			cancel,
			clear
		};
	}
	function setStatus(elements, text) {
		elements.status.textContent = text;
		elements.status.hidden = !text;
	}
	function safeUiError(error) {
		const code = error instanceof Error ? error.message : "TRANSLATION_FAILED";
		return {
			API_ENDPOINT_PROTOCOL_INVALID: "Endpoint 必須使用 HTTP 或 HTTPS",
			API_ENDPOINT_CREDENTIALS_INVALID: "Endpoint 不可包含帳號密碼",
			LOCAL_API_TOKEN_REQUIRED: "請輸入 Local API Token",
			LOCAL_API_TOKEN_INVALID: "Local API Token 不正確",
			PAGE_BATCH_TOO_LARGE: "圖片數量超過後端限制",
			PAGE_REQUEST_INVALID: "頁面請求格式不正確",
			TRANSLATION_NOT_CONFIGURED: "Windows 翻譯服務尚未完成設定",
			PAGE_API_RESPONSE_INVALID: "API 回應格式不正確"
		}[code] ?? (code.startsWith("PAGE_API_") ? "Windows API 呼叫失敗" : "翻譯失敗");
	}
	function openSettings(elements, value) {
		elements.endpoint.value = value.endpoint.replace(/\/v1\/translate-page$/, "");
		elements.token.value = "";
		elements.token.placeholder = value.token ? "已設定；留空以保留" : "輸入 Local API Token";
		elements.target.value = value.targetLanguage;
		elements.panel.hidden = false;
	}
	function requestForImages(images, settings) {
		return {
			request_id: createRequestId(),
			page_url: window.location.href,
			images,
			source_language: "auto",
			target_language: settings.targetLanguage,
			reading_order: "auto"
		};
	}
	function renderResponse(response) {
		mount(response.results, {
			progress: response.progress,
			failures: response.failures.map((failure) => failure.client_image_id),
			timingLabel: `${Math.round(response.timing.total_ms)} ms · Gemini ${response.timing.gemini_calls}`
		});
	}
	async function installUserscript(gm) {
		const existing = document.getElementById(SHELL_HOST_ID);
		if (existing) return existing;
		await gm.addStyle(HOST_STYLE);
		const host = document.createElement("div");
		host.id = SHELL_HOST_ID;
		document.documentElement.append(host);
		const elements = buildShell(host);
		let busy = false;
		elements.settings.addEventListener("click", () => {
			loadSettings(gm).then((value) => openSettings(elements, value));
		});
		elements.cancel.addEventListener("click", () => {
			elements.panel.hidden = true;
			elements.token.value = "";
		});
		elements.save.addEventListener("click", () => {
			loadSettings(gm).then((current) => saveSettings(gm, {
				endpoint: elements.endpoint.value,
				token: elements.token.value.trim() || current.token,
				targetLanguage: "zh-Hant"
			})).then(() => {
				elements.panel.hidden = true;
				elements.token.value = "";
				setStatus(elements, "設定已保存在 Userscripts 本機儲存空間");
			}).catch((error) => setStatus(elements, safeUiError(error)));
		});
		elements.clear.addEventListener("click", () => {
			deleteSettings(gm).then(() => {
				elements.endpoint.value = "";
				elements.token.value = "";
				setStatus(elements, "本機設定已清除");
			});
		});
		elements.translate.addEventListener("click", () => {
			if (busy) return;
			busy = true;
			elements.translate.disabled = true;
			(async () => {
				const settings = await loadSettings(gm);
				if (!settings.endpoint || !settings.token) {
					openSettings(elements, settings);
					setStatus(elements, "請先完成 Endpoint 與 Token 設定");
					return;
				}
				setStatus(elements, "掃描中…");
				const extraction = await collectPageImagesWithDiagnostics();
				const retryIds = new Set(consumeControlRequests().retryRequested);
				const images = retryIds.size ? extraction.images.filter((image) => retryIds.has(image.client_image_id)) : extraction.images;
				if (images.length === 0) {
					setStatus(elements, "找不到可翻譯圖片");
					return;
				}
				setStatus(elements, `翻譯中 0 / ${images.length}`);
				const response = await translatePage(gm, settings, requestForImages(images, settings));
				renderResponse(response);
				setStatus(elements, `完成 ${response.progress.successful} / ${response.progress.total}`);
			})().catch((error) => setStatus(elements, safeUiError(error))).finally(() => {
				busy = false;
				elements.translate.disabled = false;
			});
		});
		return host;
	}
	//#endregion
	//#region apps/userscript/src/entry.ts
	installUserscript(GM);
	//#endregion
})();
