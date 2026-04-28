import{w as m,M as s,L as l,O as n,S as g,a as i,r as h}from"./chunk-UVKPFVEO-xd4_T_zb.js";import{j as t}from"./jsx-runtime-isS9vmeU.js";const b=()=>[];function c(){const[e,o]=h.useState("light");h.useEffect(()=>{const r=window.localStorage.getItem("ghs-theme")==="dark"?"dark":"light";o(r),document.documentElement.dataset.ghsTheme=r},[]);function d(){const a=e==="dark"?"light":"dark";o(a),document.documentElement.dataset.ghsTheme=a,window.localStorage.setItem("ghs-theme",a)}return t.jsx("button",{type:"button",onClick:d,"aria-label":`Switch to ${e==="dark"?"light":"dark"} mode`,style:{position:"fixed",right:18,bottom:"calc(env(safe-area-inset-bottom, 0px) + 18px)",zIndex:9999,minHeight:42,padding:"0 14px",borderRadius:999,border:"1px solid var(--ghs-theme-toggle-border)",background:"var(--ghs-theme-toggle-bg)",color:"var(--ghs-theme-toggle-text)",boxShadow:"0 12px 30px rgba(0,0,0,0.22)",cursor:"pointer",fontWeight:900,fontSize:13},children:e==="dark"?"Light Mode":"Dark Mode"})}const p=m(function(){return t.jsxs("html",{lang:"en",children:[t.jsxs("head",{children:[t.jsx("meta",{charSet:"utf-8"}),t.jsx("meta",{name:"viewport",content:"width=device-width, initial-scale=1"}),t.jsx("script",{dangerouslySetInnerHTML:{__html:"try{var t=localStorage.getItem('ghs-theme')||'light';document.documentElement.dataset.ghsTheme=t;}catch(e){document.documentElement.dataset.ghsTheme='light';}"}}),t.jsx("style",{children:`
            :root {
              color-scheme: light;
              --ghs-theme-toggle-bg: #ffffff;
              --ghs-theme-toggle-border: #d7d7d7;
              --ghs-theme-toggle-text: #232323;
            }

            html[data-ghs-theme="dark"] {
              color-scheme: dark;
              --ghs-theme-toggle-bg: #020617;
              --ghs-theme-toggle-border: #334155;
              --ghs-theme-toggle-text: #f8fafc;
            }

            html[data-ghs-theme="dark"] body {
              background: #020617 !important;
              color: #f8fafc !important;
            }

            html[data-ghs-theme="dark"] main,
            html[data-ghs-theme="dark"] section,
            html[data-ghs-theme="dark"] article {
              background-color: #0f172a !important;
              color: #f8fafc !important;
            }

            html[data-ghs-theme="dark"] div[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] div[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] section[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] section[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] article[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] article[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] form[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] form[style*="background:#ffffff"] {
              background: #111827 !important;
              border-color: #334155 !important;
              color: #f8fafc !important;
            }

            html[data-ghs-theme="dark"] div[style*="background: #fbfbfb"],
            html[data-ghs-theme="dark"] div[style*="background:#fbfbfb"],
            html[data-ghs-theme="dark"] div[style*="background: #f6f6f6"],
            html[data-ghs-theme="dark"] div[style*="background:#f6f6f6"] {
              background: #0b1220 !important;
              border-color: #263449 !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="dark"] aside,
            html[data-ghs-theme="dark"] nav {
              background-color: #020617 !important;
              border-color: #1e293b !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="dark"] a,
            html[data-ghs-theme="dark"] button,
            html[data-ghs-theme="dark"] input,
            html[data-ghs-theme="dark"] select,
            html[data-ghs-theme="dark"] textarea {
              border-color: #334155 !important;
            }

            html[data-ghs-theme="dark"] input,
            html[data-ghs-theme="dark"] select,
            html[data-ghs-theme="dark"] textarea {
              background: #020617 !important;
              color: #f8fafc !important;
            }

            html[data-ghs-theme="dark"] table,
            html[data-ghs-theme="dark"] th,
            html[data-ghs-theme="dark"] td {
              background-color: #111827 !important;
              border-color: #334155 !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="light"] body {
              background: #e8e8e8 !important;
              color: #232323 !important;
            }

            @media (max-width: 720px) {
              button[aria-label^="Switch to"] {
                right: 12px !important;
                bottom: calc(env(safe-area-inset-bottom, 0px) + 82px) !important;
                min-height: 38px !important;
                padding: 0 11px !important;
                font-size: 12px !important;
              }
            }
          `}),t.jsx(s,{}),t.jsx(l,{})]}),t.jsxs("body",{children:[t.jsx(n,{}),t.jsx(c,{}),t.jsx(g,{}),t.jsx(i,{})]})]})});export{p as default,b as links};
