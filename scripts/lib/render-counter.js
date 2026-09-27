// Injected before any page script. A minimal React DevTools hook: React (dev build) hands us
// every commit; we walk the committed tree and count, per component, how many times it RENDERED
// in the window since the last mark, and why (props identity / props shallow / state / context /
// mount). A component instance is the pair {fiber, alternate}; we remember the props, the hook
// states and the context values we last saw for it, so an untouched subtree (same objects) is
// never counted.
(() => {
  const FN = new Set([0, 1, 11, 14, 15]);
  const inst = new WeakMap(); // fiber -> record (shared by both halves of the pair)
  let counts = new Map();
  let regions = {};
  let ranRegions = {};
  let commits = 0;
  let marking = null;
  const REGIONS = [
    ["ShellHeader", /^(Header|ShellHeader|HeaderChooseOrgButton|HeaderLeftMenu|HeaderRightMenu|ShellHeaderCenter|UserBlock|HeaderUserBlock)$/],
  ];
  function nameOf(f) {
    const t = f.type;
    if (!t) return "?";
    if (typeof t === "function") return t.displayName || t.name || "Anon";
    if (t.$$typeof) {
      const inner = t.type || t.render;
      if (inner) return t.displayName || inner.displayName || inner.name || "Anon";
    }
    return String(t);
  }
  function hooksOf(f) {
    const out = [];
    let h = f.tag === 1 ? null : f.memoizedState;
    let n = 0;
    while (h && typeof h === "object" && "next" in h && n < 400) {
      out.push(h.memoizedState);
      h = h.next;
      n++;
    }
    if (f.tag === 1) out.push(f.memoizedState);
    return out;
  }
  function ctxOf(f) {
    const out = [];
    let c = f.dependencies && f.dependencies.firstContext;
    let n = 0;
    while (c && n < 100) {
      out.push([c.context && (c.context.displayName || "ctx"), c.memoizedValue]);
      c = c.next;
      n++;
    }
    return out;
  }
  function chain(f, depth) {
    const names = [];
    let p = f.return;
    while (p && names.length < depth) {
      if (FN.has(p.tag)) names.push(nameOf(p));
      p = p.return;
    }
    return names;
  }
  function ancestorsAll(f) {
    const names = [];
    let p = f.return;
    let n = 0;
    while (p && n < 3000) {
      if (FN.has(p.tag)) names.push(nameOf(p));
      p = p.return;
      n++;
    }
    return names;
  }
  function why(prev, f) {
    if (!prev) return ["mount"];
    const reasons = [];
    const pp = prev.props, np = f.memoizedProps;
    if (pp !== np) {
      const changed = [];
      const keys = new Set([...Object.keys(pp || {}), ...Object.keys(np || {})]);
      for (const k of keys) if ((pp || {})[k] !== (np || {})[k]) changed.push(k);
      reasons.push(changed.length ? "props:" + changed.slice(0, 8).join(",") : "props:same-shallow(parent)");
    }
    const ph = prev.hooks, nh = hooksOf(f);
    const hc = [];
    for (let i = 0; i < Math.max(ph.length, nh.length); i++) if (ph[i] !== nh[i]) hc.push(i);
    if (hc.length) reasons.push("hooks:" + hc.slice(0, 6).join(","));
    const pc = prev.ctx, nc = ctxOf(f);
    const cc = [];
    for (let i = 0; i < Math.max(pc.length, nc.length); i++) if (!pc[i] || !nc[i] || pc[i][1] !== nc[i][1]) cc.push((nc[i] || pc[i])[0]);
    if (cc.length) reasons.push("context:" + cc.slice(0, 4).join(","));
    if (!reasons.length) reasons.push("parent(same props obj?)");
    return reasons;
  }
  function visit(root) {
    const stack = [root.current];
    let guard = 0;
    while (stack.length && guard < 200000) {
      guard++;
      const f = stack.pop();
      if (FN.has(f.tag)) {
        const prev = inst.get(f) || (f.alternate && inst.get(f.alternate));
        const hooks = hooksOf(f);
        const rendered =
          !prev ||
          prev.props !== f.memoizedProps ||
          prev.hookHead !== (f.tag === 1 ? f.stateNode : f.memoizedState) ||
          hooks.some((h, i) => h !== prev.hooks[i]);
        const ctx = ctxOf(f);
        const ctxChanged = prev && ctx.some((c, i) => !prev.ctx[i] || prev.ctx[i][1] !== c[1]);
        if (rendered || ctxChanged) {
          const name = nameOf(f);
          if (marking) {
            const reasons = why(prev, f);
            let rg = "other";
            let q = f;
            const RS = window.__rcRegions || [];
            let hops = 0;
            outer: while (q && hops < 4000) {
              if (FN.has(q.tag)) {
                const qn = nameOf(q);
                for (const r of RS) if (r === qn) { rg = r; break outer; }
              }
              q = q.return;
              hops++;
            }
            regions[rg] = (regions[rg] || 0) + 1;
            let e = counts.get(name);
            if (!e) {
              e = { n: 0, ran: 0, reasons: {}, parents: {} };
              counts.set(name, e);
            }
            e.n++;
            // RAN: React's own PerformedWork flag (what DevTools' didFiberRender reads). `n` also
            // counts a memo wrapper (tag 14/15) whose props object moved but whose compare BAILED
            // OUT — React still stores the new props on the fiber. `ran` counts only bodies that
            // actually executed (lane RENDER-2, 2026-09-27).
            if (!prev || (f.flags & 1) === 1) {
              e.ran++;
              ranRegions[rg] = (ranRegions[rg] || 0) + 1;
            }
            for (const r of reasons) e.reasons[r] = (e.reasons[r] || 0) + 1;
            const par = chain(f, 2).join("<");
            e.parents[par] = (e.parents[par] || 0) + 1;
            if (!e.anc && window.__rcTrack && window.__rcTrack.test(name)) {
              e.anc = ancestorsAll(f).slice(0, 60);
              // Was this component compiled by the React Compiler? Its body reads the memo cache.
              const src = String((f.type && (f.type.type || f.type.render)) || f.type);
              e.compiled = /memo_cache_sentinel|\$\[0\]/.test(src);
              if (window.__rcDumpSource) (window.__rcSrc = window.__rcSrc || {})[name] = src;
            }
          }
          const rec = { props: f.memoizedProps, hookHead: f.tag === 1 ? f.stateNode : f.memoizedState, hooks, ctx };
          inst.set(f, rec);
          if (f.alternate) inst.set(f.alternate, rec);
        }
      }
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
  }
  const renderers = new Map();
  let rid = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(r) {
      rid++;
      renderers.set(rid, r);
      return rid;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      commits++;
      try {
        visit(root);
      } catch (e) {
        window.__rcErr = String(e && e.stack);
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    setStrictMode() {},
  };
  window.__rc = {
    mark(label) {
      counts = new Map();
      regions = {};
      ranRegions = {};
      commits = 0;
      marking = label;
    },
    take() {
      const out = {};
      for (const [k, v] of counts) out[k] = v;
      return { label: marking, commits, regions, ranRegions, counts: out };
    },
  };
  window.__rc.mark("load");
})();
