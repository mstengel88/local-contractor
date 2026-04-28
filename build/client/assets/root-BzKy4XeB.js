import{w as r,M as d,L as g,O as s,S as i,a as n,r as o}from"./chunk-UVKPFVEO-xd4_T_zb.js";import{j as t}from"./jsx-runtime-isS9vmeU.js";const p=()=>[];function f(){const[e,h]=o.useState("light");o.useEffect(()=>{const l=window.localStorage.getItem("ghs-theme")==="dark"?"dark":"light";h(l),document.documentElement.dataset.ghsTheme=l},[]);function m(){const a=e==="dark"?"light":"dark";h(a),document.documentElement.dataset.ghsTheme=a,window.localStorage.setItem("ghs-theme",a)}return t.jsx("button",{type:"button",onClick:m,"aria-label":`Switch to ${e==="dark"?"light":"dark"} mode`,style:{position:"fixed",right:18,bottom:"calc(env(safe-area-inset-bottom, 0px) + 18px)",zIndex:9999,minHeight:42,padding:"0 14px",borderRadius:999,border:"1px solid var(--ghs-theme-toggle-border)",background:"var(--ghs-theme-toggle-bg)",color:"var(--ghs-theme-toggle-text)",boxShadow:"0 12px 30px rgba(0,0,0,0.22)",cursor:"pointer",fontWeight:900,fontSize:13},children:e==="dark"?"Light Mode":"Dark Mode"})}const k=r(function(){return t.jsxs("html",{lang:"en",children:[t.jsxs("head",{children:[t.jsx("meta",{charSet:"utf-8"}),t.jsx("meta",{name:"viewport",content:"width=device-width, initial-scale=1"}),t.jsx("script",{dangerouslySetInnerHTML:{__html:"try{var t=localStorage.getItem('ghs-theme')||'light';document.documentElement.dataset.ghsTheme=t;}catch(e){document.documentElement.dataset.ghsTheme='light';}"}}),t.jsx("style",{children:`
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

            html[data-ghs-theme="light"] main[style*="#0f172a"],
            html[data-ghs-theme="light"] main[style*="#111827"],
            html[data-ghs-theme="light"] main[style*="#020617"],
            html[data-ghs-theme="light"] main[style*="#030712"],
            html[data-ghs-theme="light"] main[style*="radial-gradient"],
            html[data-ghs-theme="light"] main[style*="linear-gradient"],
            html[data-ghs-theme="light"] section[style*="#0f172a"],
            html[data-ghs-theme="light"] section[style*="#111827"],
            html[data-ghs-theme="light"] section[style*="#020617"],
            html[data-ghs-theme="light"] section[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] section[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] article[style*="#0f172a"],
            html[data-ghs-theme="light"] article[style*="#111827"],
            html[data-ghs-theme="light"] article[style*="#020617"],
            html[data-ghs-theme="light"] article[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] article[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] form[style*="#0f172a"],
            html[data-ghs-theme="light"] form[style*="#111827"],
            html[data-ghs-theme="light"] form[style*="#020617"],
            html[data-ghs-theme="light"] form[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] form[style*="rgba(17, 24, 39"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
              box-shadow: 0 1px 2px rgba(0,0,0,0.08) !important;
            }

            html[data-ghs-theme="light"] div[style*="#0f172a"],
            html[data-ghs-theme="light"] div[style*="#111827"],
            html[data-ghs-theme="light"] div[style*="#020617"],
            html[data-ghs-theme="light"] div[style*="#030712"],
            html[data-ghs-theme="light"] div[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] div[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] div[style*="rgba(2, 6, 23"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] aside,
            html[data-ghs-theme="light"] nav {
              background-color: #4a4a4a !important;
              border-color: #343434 !important;
              color: #ffffff !important;
            }

            html[data-ghs-theme="light"] nav a,
            html[data-ghs-theme="light"] aside a,
            html[data-ghs-theme="light"] nav button,
            html[data-ghs-theme="light"] aside button {
              color: #ffffff !important;
            }

            html[data-ghs-theme="light"] input,
            html[data-ghs-theme="light"] select,
            html[data-ghs-theme="light"] textarea {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] table,
            html[data-ghs-theme="light"] th,
            html[data-ghs-theme="light"] td {
              background-color: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] th {
              background-color: #f6f6f6 !important;
              color: #555555 !important;
            }

            html[data-ghs-theme="light"] [style*="color: #f8fafc"],
            html[data-ghs-theme="light"] [style*="color:#f8fafc"],
            html[data-ghs-theme="light"] [style*="color: #e2e8f0"],
            html[data-ghs-theme="light"] [style*="color:#e2e8f0"],
            html[data-ghs-theme="light"] [style*="color: #cbd5e1"],
            html[data-ghs-theme="light"] [style*="color:#cbd5e1"] {
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] [style*="color: #94a3b8"],
            html[data-ghs-theme="light"] [style*="color:#94a3b8"],
            html[data-ghs-theme="light"] [style*="color: #64748b"],
            html[data-ghs-theme="light"] [style*="color:#64748b"] {
              color: #777777 !important;
            }

            html[data-ghs-theme="light"] button[aria-label^="Switch to"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
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
          `}),t.jsx(d,{}),t.jsx(g,{})]}),t.jsxs("body",{children:[t.jsx(s,{}),t.jsx(f,{}),t.jsx(i,{}),t.jsx(n,{})]})]})});export{k as default,p as links};
