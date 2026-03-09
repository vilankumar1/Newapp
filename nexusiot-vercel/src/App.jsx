import { useState, useEffect, useRef, useCallback } from "react";

// ─── Widget Registry ───────────────────────────────────────────────────────────
const WIDGET_CATALOG = [
  { type: "gauge",    label: "Gauge",        icon: "⟳", category: "Display",  defaultW: 2, defaultH: 2 },
  { type: "value",    label: "Value Panel",  icon: "🔢", category: "Display",  defaultW: 2, defaultH: 1 },
  { type: "graph",    label: "Line Graph",   icon: "📈", category: "Display",  defaultW: 4, defaultH: 2 },
  { type: "led",      label: "LED Indicator",icon: "💡", category: "Display",  defaultW: 1, defaultH: 1 },
  { type: "slider",   label: "Slider",       icon: "⟺", category: "Control",  defaultW: 3, defaultH: 1 },
  { type: "switch",   label: "Switch",       icon: "⏻", category: "Control",  defaultW: 1, defaultH: 1 },
  { type: "button",   label: "Button",       icon: "⬛", category: "Control",  defaultW: 1, defaultH: 1 },
  { type: "joystick", label: "Joystick",     icon: "🕹", category: "Control",  defaultW: 2, defaultH: 2 },
  { type: "colorpick",label: "Color Picker", icon: "🎨", category: "Control",  defaultW: 2, defaultH: 2 },
  { type: "terminal", label: "Terminal",     icon: "⌨", category: "Other",    defaultW: 4, defaultH: 3 },
  { type: "map",      label: "GPS Map",      icon: "📍", category: "Other",    defaultW: 4, defaultH: 3 },
  { type: "table",    label: "Data Table",   icon: "📋", category: "Other",    defaultW: 4, defaultH: 3 },
];

const GRID_COLS = 12;
const CELL_PX  = 72;
const GAP_PX   = 8;

// ─── Utility ──────────────────────────────────────────────────────────────────
let _id = 1;
const uid = () => `w${_id++}`;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makeWidget(type, col = 0, row = 0) {
  const cat = WIDGET_CATALOG.find(c => c.type === type);
  return {
    id: uid(), type,
    col, row,
    w: cat?.defaultW ?? 2,
    h: cat?.defaultH ?? 2,
    label: cat?.label ?? type,
    pin: "V0",
    min: 0, max: 100,
    unit: "",
    color: "#00e5ff",
    history: [],
    value: null,
  };
}

// ─── WebSocket hook ───────────────────────────────────────────────────────────
function useDeviceSocket(serverUrl, onMessage) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!serverUrl) return;
    const connect = () => {
      try {
        ws.current = new WebSocket(serverUrl);
        ws.current.onopen  = () => setConnected(true);
        ws.current.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
        ws.current.onerror = () => ws.current?.close();
        ws.current.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch {} };
      } catch {}
    };
    connect();
    return () => ws.current?.close();
  }, [serverUrl]);

  const send = useCallback((msg) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify(msg));
  }, []);

  return { connected, send };
}

// ─── Individual Widget Renderers ──────────────────────────────────────────────
function GaugeWidget({ widget }) {
  const pct = ((widget.value ?? widget.min) - widget.min) / ((widget.max - widget.min) || 1);
  const angle = -135 + pct * 270;
  const r = 38, cx = 50, cy = 55;
  const toXY = (deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(-135);
  const [ex, ey] = toXY(-135 + pct * 270);
  const large = pct * 270 > 180 ? 1 : 0;
  return (
    <div className="widget-inner gauge-widget">
      <svg viewBox="0 0 100 80" style={{width:"100%",maxHeight:"80%"}}>
        <path d={`M ${toXY(-135)[0]} ${toXY(-135)[1]} A ${r} ${r} 0 1 1 ${toXY(135)[0]} ${toXY(135)[1]}`}
          fill="none" stroke="#1a2a3a" strokeWidth="8" strokeLinecap="round"/>
        {pct > 0 && <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
          fill="none" stroke={widget.color} strokeWidth="8" strokeLinecap="round"/>}
        <line x1={cx} y1={cy}
          x2={cx + 28*Math.cos((angle-90)*Math.PI/180)}
          y2={cy + 28*Math.sin((angle-90)*Math.PI/180)}
          stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="4" fill="white"/>
        <text x={cx} y={cy+20} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
          {widget.value ?? "--"}{widget.unit}
        </text>
      </svg>
      <div className="widget-label">{widget.label}</div>
    </div>
  );
}

function ValueWidget({ widget }) {
  return (
    <div className="widget-inner value-widget">
      <div className="value-big" style={{color: widget.color}}>
        {widget.value ?? "--"}<span className="value-unit">{widget.unit}</span>
      </div>
      <div className="widget-label">{widget.label}</div>
      <div className="widget-pin">{widget.pin}</div>
    </div>
  );
}

function GraphWidget({ widget }) {
  const hist = widget.history.slice(-60);
  if (!hist.length) return (
    <div className="widget-inner graph-widget">
      <div className="widget-label">{widget.label}</div>
      <div style={{color:"#555",fontSize:"12px",marginTop:"16px"}}>No data yet…</div>
    </div>
  );
  const vals = hist.map(h => h.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals) || minV + 1;
  const W = 260, H = 80;
  const pts = hist.map((h, i) => {
    const x = (i / (hist.length - 1 || 1)) * W;
    const y = H - ((h.v - minV) / (maxV - minV)) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="widget-inner graph-widget">
      <div className="widget-label">{widget.label} <span style={{color:"#888",fontWeight:400}}>{widget.pin}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",flex:1,marginTop:4}}>
        <defs>
          <linearGradient id={`g${widget.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={widget.color} stopOpacity="0.4"/>
            <stop offset="100%" stopColor={widget.color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#g${widget.id})`}/>
        <polyline points={pts} fill="none" stroke={widget.color} strokeWidth="2"/>
        <text x="0" y="10" fill="#666" fontSize="9">{maxV.toFixed(1)}</text>
        <text x="0" y={H-2} fill="#666" fontSize="9">{minV.toFixed(1)}</text>
      </svg>
    </div>
  );
}

function LedWidget({ widget }) {
  const on = !!widget.value;
  return (
    <div className="widget-inner led-widget">
      <div className="led-circle" style={{
        background: on ? widget.color : "#1a2a3a",
        boxShadow: on ? `0 0 16px ${widget.color}, 0 0 32px ${widget.color}66` : "none"
      }}/>
      <div className="widget-label">{widget.label}</div>
    </div>
  );
}

function SliderWidget({ widget, onSend }) {
  return (
    <div className="widget-inner slider-widget">
      <div className="widget-label">{widget.label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8,width:"100%"}}>
        <span style={{color:"#666",fontSize:11}}>{widget.min}</span>
        <input type="range" min={widget.min} max={widget.max}
          value={widget.value ?? widget.min}
          style={{"--c": widget.color}}
          onChange={e => onSend(widget.pin, Number(e.target.value))}/>
        <span style={{color:"#666",fontSize:11}}>{widget.max}</span>
      </div>
      <div style={{color:widget.color,fontSize:14,fontWeight:700}}>
        {widget.value ?? widget.min}{widget.unit}
      </div>
    </div>
  );
}

function SwitchWidget({ widget, onSend }) {
  const on = !!widget.value;
  return (
    <div className="widget-inner switch-widget" onClick={() => onSend(widget.pin, on ? 0 : 1)}>
      <div className={`toggle-track ${on?"on":""}`} style={on ? {background:widget.color} : {}}>
        <div className="toggle-thumb"/>
      </div>
      <div className="widget-label">{widget.label}</div>
    </div>
  );
}

function ButtonWidget({ widget, onSend }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="widget-inner button-widget">
      <button
        className={`iot-btn ${pressed?"active":""}`}
        style={pressed ? {background:widget.color,borderColor:widget.color} : {borderColor:widget.color,color:widget.color}}
        onMouseDown={() => { setPressed(true); onSend(widget.pin, 1); }}
        onMouseUp={() => { setPressed(false); onSend(widget.pin, 0); }}
        onTouchStart={() => { setPressed(true); onSend(widget.pin, 1); }}
        onTouchEnd={() => { setPressed(false); onSend(widget.pin, 0); }}
      >{widget.label}</button>
    </div>
  );
}

function TerminalWidget({ widget, onSend }) {
  const [input, setInput] = useState("");
  const logs = widget.history.slice(-20);
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({behavior:"smooth"}), [logs.length]);
  return (
    <div className="widget-inner terminal-widget">
      <div className="terminal-header">{widget.label}</div>
      <div className="terminal-body">
        {logs.map((l,i) => <div key={i} className="terminal-line">&gt; {l.v}</div>)}
        <div ref={endRef}/>
      </div>
      <div className="terminal-input-row">
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&input){onSend(widget.pin,input);setInput("");}}}
          placeholder="Send command…" className="terminal-input"/>
      </div>
    </div>
  );
}

function TableWidget({ widget }) {
  const rows = widget.history.slice(-50);
  return (
    <div className="widget-inner table-widget">
      <div className="widget-label">{widget.label}</div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Time</th><th>Value</th></tr></thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i}>
                <td>{new Date(r.t).toLocaleTimeString()}</td>
                <td style={{color:"#00e5ff"}}>{r.v}{widget.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColorPickWidget({ widget, onSend }) {
  return (
    <div className="widget-inner colorpick-widget">
      <div className="widget-label">{widget.label}</div>
      <input type="color" value={widget.value ?? "#ff0000"}
        onChange={e => onSend(widget.pin, e.target.value)}
        style={{width:64,height:64,border:"none",borderRadius:8,cursor:"pointer",background:"none"}}/>
      <div style={{color:"#888",fontSize:11}}>{widget.value ?? "#ff0000"}</div>
    </div>
  );
}

function MapWidget({ widget }) {
  const [lat, lng] = widget.value ? widget.value.toString().split(",").map(Number) : [0, 0];
  return (
    <div className="widget-inner map-widget">
      <div className="widget-label">{widget.label}</div>
      {widget.value
        ? <iframe
            src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
            style={{width:"100%",flex:1,border:"none",borderRadius:8}}
            title="GPS"/>
        : <div style={{color:"#555",fontSize:12}}>Waiting for GPS data…</div>
      }
    </div>
  );
}

// ─── Widget Wrapper (draggable/resizable) ─────────────────────────────────────
function WidgetCard({ widget, isEdit, onSend, onDelete, onConfig, onMove, onResize }) {
  const dragOffset = useRef(null);
  const resizeStart = useRef(null);

  function handleDragStart(e) {
    if (!isEdit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("widgetId", widget.id);
  }

  function renderInner() {
    switch (widget.type) {
      case "gauge":    return <GaugeWidget widget={widget}/>;
      case "value":    return <ValueWidget widget={widget}/>;
      case "graph":    return <GraphWidget widget={widget}/>;
      case "led":      return <LedWidget widget={widget}/>;
      case "slider":   return <SliderWidget widget={widget} onSend={onSend}/>;
      case "switch":   return <SwitchWidget widget={widget} onSend={onSend}/>;
      case "button":   return <ButtonWidget widget={widget} onSend={onSend}/>;
      case "terminal": return <TerminalWidget widget={widget} onSend={onSend}/>;
      case "table":    return <TableWidget widget={widget}/>;
      case "colorpick":return <ColorPickWidget widget={widget} onSend={onSend}/>;
      case "map":      return <MapWidget widget={widget}/>;
      default:         return <div className="widget-inner"><div className="widget-label">{widget.label}</div></div>;
    }
  }

  const style = {
    gridColumn: `${widget.col + 1} / span ${widget.w}`,
    gridRow: `${widget.row + 1} / span ${widget.h}`,
  };

  return (
    <div className={`widget-card ${isEdit ? "edit-mode" : ""}`}
      style={style}
      draggable={isEdit}
      onDragStart={handleDragStart}>
      {renderInner()}
      {isEdit && (
        <div className="widget-toolbar">
          <button onClick={() => onConfig(widget.id)} title="Configure">⚙</button>
          <button onClick={() => onDelete(widget.id)} title="Delete" style={{color:"#f55"}}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Config Modal ─────────────────────────────────────────────────────────────
function ConfigModal({ widget, onSave, onClose }) {
  const [form, setForm] = useState({ ...widget });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⚙ Configure — {widget.label}</div>
        <label>Label <input value={form.label} onChange={e=>set("label",e.target.value)}/></label>
        <label>Pin / Virtual Pin <input value={form.pin} onChange={e=>set("pin",e.target.value)} placeholder="V0"/></label>
        <label>Unit <input value={form.unit} onChange={e=>set("unit",e.target.value)} placeholder="°C"/></label>
        {["gauge","slider","graph","value","table"].includes(widget.type) && <>
          <label>Min <input type="number" value={form.min} onChange={e=>set("min",Number(e.target.value))}/></label>
          <label>Max <input type="number" value={form.max} onChange={e=>set("max",Number(e.target.value))}/></label>
        </>}
        <label>Color <input type="color" value={form.color} onChange={e=>set("color",e.target.value)}/></label>
        <div className="modal-btns">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={() => { onSave(form); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Device Selector ──────────────────────────────────────────────────────────
function DeviceBar({ devices, activeDevice, setActiveDevice, addDevice }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="device-bar">
      {devices.map(d => (
        <button key={d.id} className={`device-tab ${d.id===activeDevice?"active":""}`}
          onClick={() => setActiveDevice(d.id)}>
          <span className={`dot ${d.online?"online":"offline"}`}/>
          {d.name}
        </button>
      ))}
      {adding
        ? <span style={{display:"flex",gap:4}}>
            <input autoFocus value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&name){addDevice(name);setName("");setAdding(false);}}}
              placeholder="Device name" className="device-input"/>
            <button onClick={()=>setAdding(false)} className="btn-xs">✕</button>
          </span>
        : <button className="btn-add-device" onClick={()=>setAdding(true)}>+ Device</button>
      }
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [devices, setDevices] = useState([
    { id: "dev1", name: "ESP32 #1", online: false, serverUrl: "" },
  ]);
  const [activeDevice, setActiveDevice] = useState("dev1");
  const [allWidgets, setAllWidgets] = useState({ dev1: [] });
  const [isEdit, setIsEdit] = useState(false);
  const [configWidget, setConfigWidget] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const widgets = allWidgets[activeDevice] ?? [];
  const setWidgets = (updater) =>
    setAllWidgets(prev => ({
      ...prev,
      [activeDevice]: typeof updater === "function" ? updater(prev[activeDevice] ?? []) : updater,
    }));

  const device = devices.find(d => d.id === activeDevice);

  // WebSocket
  const { connected, send } = useDeviceSocket(device?.serverUrl || null, (msg) => {
    // msg: { pin: "V0", value: 23.4 }
    setWidgets(ws => ws.map(w => {
      if (w.pin !== msg.pin) return w;
      const ts = Date.now();
      return {
        ...w,
        value: msg.value,
        history: [...w.history.slice(-199), { t: ts, v: msg.value }],
      };
    }));
    // update device online state
    setDevices(ds => ds.map(d => d.id === activeDevice ? {...d, online: true} : d));
  });

  const handleSend = useCallback((pin, value) => {
    send({ pin, value });
    setWidgets(ws => ws.map(w => w.pin === pin ? {...w, value} : w));
  }, [send]);

  // Drag-and-drop from catalog
  function handleCatalogDrop(type, col, row) {
    setWidgets(ws => [...ws, makeWidget(type, col, row)]);
    setShowCatalog(false);
  }

  // Grid drop
  function handleGridDrop(e, col, row) {
    e.preventDefault();
    const wid = e.dataTransfer.getData("widgetId");
    const type = e.dataTransfer.getData("widgetType");
    if (wid) {
      setWidgets(ws => ws.map(w => w.id === wid ? {...w, col, row} : w));
    } else if (type) {
      handleCatalogDrop(type, col, row);
    }
  }

  function addDevice(name) {
    const id = uid();
    setDevices(ds => [...ds, { id, name, online: false, serverUrl: "" }]);
    setAllWidgets(aw => ({ ...aw, [id]: [] }));
    setActiveDevice(id);
  }

  // Demo: simulate incoming data
  useEffect(() => {
    const t = setInterval(() => {
      if (connected) return; // don't simulate if real connection
      setWidgets(ws => ws.map(w => {
        if (!["gauge","value","graph","led","table"].includes(w.type)) return w;
        const v = w.type === "led"
          ? Math.random() > 0.5 ? 1 : 0
          : Number((w.min + Math.random() * (w.max - w.min)).toFixed(1));
        return {
          ...w, value: v,
          history: [...w.history.slice(-199), { t: Date.now(), v }],
        };
      }));
    }, 2000);
    return () => clearInterval(t);
  }, [connected, activeDevice]);

  // Generate grid drop cells
  const ROWS = 8;
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      cells.push({ r, c });

  return (
    <div className="app">
      <style>{CSS}</style>
      {/* HEADER */}
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">NEXUS<span>IOT</span></span>
        </div>
        <DeviceBar devices={devices} activeDevice={activeDevice}
          setActiveDevice={setActiveDevice} addDevice={addDevice}/>
        <div className="header-actions">
          <span className={`conn-badge ${connected?"online":"offline"}`}>
            {connected ? "● LIVE" : "○ DEMO"}
          </span>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Server settings">⚙</button>
          <button className={`btn-edit ${isEdit?"active":""}`} onClick={() => { setIsEdit(e => !e); setShowCatalog(false); }}>
            {isEdit ? "✓ Done" : "✏ Edit"}
          </button>
        </div>
      </header>

      {/* TOOLBAR (edit mode) */}
      {isEdit && (
        <div className="catalog-bar">
          <div className="catalog-scroll">
            {WIDGET_CATALOG.map(w => (
              <div key={w.type} className="catalog-chip"
                draggable
                onDragStart={e => e.dataTransfer.setData("widgetType", w.type)}
                onClick={() => {
                  const nextCol = (widgets.length * 2) % GRID_COLS;
                  const nextRow = Math.floor(widgets.length / (GRID_COLS/2)) * 2;
                  handleCatalogDrop(w.type, nextCol, nextRow);
                }}>
                <span>{w.icon}</span>
                <span>{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DASHBOARD GRID */}
      <main className="dashboard">
        <div className="grid-wrap"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const col = clamp(Math.floor((e.clientX - rect.left) / (CELL_PX + GAP_PX)), 0, GRID_COLS-1);
            const row = clamp(Math.floor((e.clientY - rect.top)  / (CELL_PX + GAP_PX)), 0, ROWS-1);
            handleGridDrop(e, col, row);
          }}>
          {isEdit && cells.map(({r,c}) => (
            <div key={`${r}-${c}`} className="grid-cell"
              style={{gridColumn: c+1, gridRow: r+1}}/>
          ))}
          {widgets.map(w => (
            <WidgetCard key={w.id} widget={w} isEdit={isEdit}
              onSend={handleSend}
              onDelete={id => setWidgets(ws => ws.filter(x => x.id !== id))}
              onConfig={id => setConfigWidget(widgets.find(x => x.id === id))}
              onMove={(id,col,row) => setWidgets(ws => ws.map(x => x.id===id ? {...x,col,row} : x))}
              onResize={(id,w2,h2) => setWidgets(ws => ws.map(x => x.id===id ? {...x,w:w2,h:h2} : x))}
            />
          ))}
          {widgets.length === 0 && !isEdit && (
            <div className="empty-state">
              <div style={{fontSize:48}}>⬡</div>
              <div style={{fontSize:18,fontWeight:600,marginTop:8}}>Your dashboard is empty</div>
              <div style={{color:"#557",marginTop:4}}>Click <b>✏ Edit</b> to add widgets</div>
            </div>
          )}
        </div>
      </main>

      {/* CONFIG MODAL */}
      {configWidget && (
        <ConfigModal widget={configWidget}
          onSave={updated => setWidgets(ws => ws.map(w => w.id === updated.id ? updated : w))}
          onClose={() => setConfigWidget(null)}/>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔌 Server Connection</div>
            <label>WebSocket URL
              <input value={device?.serverUrl ?? ""}
                onChange={e => setDevices(ds => ds.map(d => d.id===activeDevice ? {...d, serverUrl: e.target.value} : d))}
                placeholder="ws://YOUR_SERVER:8000/ws"/>
            </label>
            <p style={{color:"#557",fontSize:12,margin:"4px 0 12px"}}>
              Example: ws://192.168.1.100:8000/ws<br/>
              For Railway: wss://your-app.railway.app/ws
            </p>
            <div className="modal-btns">
              <button className="btn-save" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #060c14;
    --bg2: #0b1520;
    --bg3: #0f1d2a;
    --border: #1a3040;
    --accent: #00e5ff;
    --accent2: #7c4dff;
    --text: #cde6f5;
    --muted: #4a6070;
    --cell: 72px;
    --gap: 8px;
  }

  body { background: var(--bg); color: var(--text); font-family: 'Exo 2', sans-serif; overflow-x: hidden; }

  .app { display: flex; flex-direction: column; height: 100vh; }

  /* HEADER */
  .app-header {
    display: flex; align-items: center; gap: 16px;
    padding: 0 20px; height: 56px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
    flex-shrink: 0;
  }
  .logo { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .logo-icon { color: var(--accent); font-size: 22px; }
  .logo-text { font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 900; letter-spacing: 2px; color: white; }
  .logo-text span { color: var(--accent); }
  .header-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

  /* DEVICE BAR */
  .device-bar { display: flex; gap: 6px; align-items: center; flex: 1; overflow-x: auto; }
  .device-bar::-webkit-scrollbar { height: 4px; }
  .device-tab {
    padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); cursor: pointer; font-family: inherit; font-size: 13px;
    display: flex; align-items: center; gap: 6px; white-space: nowrap; transition: all .2s;
  }
  .device-tab:hover { border-color: var(--accent); color: var(--text); }
  .device-tab.active { background: var(--accent)22; border-color: var(--accent); color: var(--accent); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #333; }
  .dot.online { background: #0f0; box-shadow: 0 0 6px #0f0; }
  .dot.offline { background: #f55; }
  .btn-add-device {
    padding: 4px 12px; border-radius: 20px; border: 1px dashed var(--muted);
    background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; font-family: inherit;
    transition: all .2s;
  }
  .btn-add-device:hover { border-color: var(--accent); color: var(--accent); }
  .device-input {
    background: var(--bg3); border: 1px solid var(--accent); border-radius: 20px;
    color: var(--text); padding: 4px 12px; font-size: 13px; font-family: inherit; outline: none;
  }
  .btn-xs { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px; padding: 4px; }

  /* CONNECTION BADGE */
  .conn-badge { font-size: 11px; font-family: 'Orbitron', sans-serif; padding: 3px 10px; border-radius: 20px; }
  .conn-badge.online { color: #0f0; border: 1px solid #0f0; background: #0f02; }
  .conn-badge.offline { color: #f88; border: 1px solid #f882; background: #f552; }

  .btn-icon {
    background: transparent; border: 1px solid var(--border); color: var(--muted);
    width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 14px;
    transition: all .2s;
  }
  .btn-icon:hover { border-color: var(--accent); color: var(--accent); }
  .btn-edit {
    padding: 6px 16px; border-radius: 8px; border: 1px solid var(--accent);
    background: transparent; color: var(--accent); cursor: pointer; font-family: 'Orbitron', sans-serif;
    font-size: 11px; letter-spacing: 1px; transition: all .2s;
  }
  .btn-edit:hover, .btn-edit.active { background: var(--accent); color: #000; }

  /* CATALOG BAR */
  .catalog-bar {
    background: var(--bg2); border-bottom: 1px solid var(--border);
    padding: 8px 16px; flex-shrink: 0;
  }
  .catalog-scroll { display: flex; gap: 8px; overflow-x: auto; }
  .catalog-scroll::-webkit-scrollbar { height: 4px; }
  .catalog-chip {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--bg3); cursor: pointer; font-size: 11px; white-space: nowrap;
    transition: all .2s; color: var(--text); user-select: none;
  }
  .catalog-chip:hover { border-color: var(--accent); background: var(--accent)11; color: var(--accent); }
  .catalog-chip span:first-child { font-size: 18px; }

  /* DASHBOARD */
  .dashboard { flex: 1; overflow: auto; padding: 16px; background: var(--bg); }
  .grid-wrap {
    display: grid;
    grid-template-columns: repeat(12, var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    min-height: 600px;
    position: relative;
  }
  .grid-cell {
    border: 1px dashed #1a3a4a44; border-radius: 8px;
    pointer-events: none;
  }

  /* WIDGET CARD */
  .widget-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    transition: border-color .2s, box-shadow .2s;
  }
  .widget-card:hover { border-color: #2a4055; }
  .widget-card.edit-mode { cursor: grab; border-style: dashed; }
  .widget-card.edit-mode:hover { border-color: var(--accent); box-shadow: 0 0 12px var(--accent)33; }
  .widget-toolbar {
    position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;
  }
  .widget-toolbar button {
    width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); cursor: pointer; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
  }
  .widget-toolbar button:hover { background: var(--bg3); }

  /* WIDGET INNER */
  .widget-inner { width:100%; height:100%; padding:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .widget-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; text-align: center; }
  .widget-pin { font-size: 10px; color: #2a4055; margin-top: 2px; }

  /* GAUGE */
  .gauge-widget svg { overflow: visible; }

  /* VALUE */
  .value-widget { justify-content: center; }
  .value-big { font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 700; line-height: 1; }
  .value-unit { font-size: 14px; font-weight: 400; margin-left: 2px; }

  /* GRAPH */
  .graph-widget { align-items: stretch; }

  /* LED */
  .led-widget { gap: 8px; }
  .led-circle { width: 36px; height: 36px; border-radius: 50%; transition: all .3s; }

  /* SLIDER */
  .slider-widget { gap: 6px; width: 100%; }
  .slider-widget input[type=range] { flex: 1; -webkit-appearance: none; height: 4px; border-radius: 2px; background: #1a3040; outline: none; }
  .slider-widget input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--c, #00e5ff); cursor: pointer; }

  /* SWITCH */
  .switch-widget { gap: 8px; cursor: pointer; }
  .toggle-track { width: 52px; height: 28px; border-radius: 14px; background: #1a3040; transition: background .3s; position: relative; }
  .toggle-track.on .toggle-thumb { transform: translateX(24px); }
  .toggle-thumb { width: 22px; height: 22px; border-radius: 50%; background: white; position: absolute; top: 3px; left: 3px; transition: transform .3s; }

  /* BUTTON */
  .button-widget { }
  .iot-btn {
    padding: 10px 20px; border-radius: 8px; border: 2px solid; background: transparent;
    cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 600;
    transition: all .15s; user-select: none;
  }
  .iot-btn.active { color: #000 !important; }

  /* TERMINAL */
  .terminal-widget { align-items: stretch; gap: 4px; padding: 8px; }
  .terminal-header { font-family: monospace; font-size: 11px; color: var(--accent); }
  .terminal-body { flex: 1; overflow-y: auto; font-family: monospace; font-size: 11px; color: #7af; }
  .terminal-line { padding: 1px 0; }
  .terminal-input-row { display: flex; }
  .terminal-input { flex: 1; background: #040c14; border: 1px solid #1a3040; color: #7af; font-family: monospace; font-size: 11px; padding: 4px 8px; border-radius: 4px; outline: none; }

  /* TABLE */
  .table-widget { align-items: stretch; }
  .table-scroll { flex: 1; overflow-y: auto; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { color: var(--muted); font-weight: 500; text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 3px 8px; border-bottom: 1px solid #0f1d2a; }

  /* MAP */
  .map-widget { align-items: stretch; }

  /* COLORPICK */
  .colorpick-widget { gap: 8px; }

  /* EMPTY STATE */
  .empty-state {
    grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 300px; color: #2a4055;
  }

  /* MODAL */
  .modal-backdrop {
    position: fixed; inset: 0; background: #000a; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
  }
  .modal-box {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 16px;
    padding: 24px; min-width: 320px; max-width: 400px; width: 90%; display: flex; flex-direction: column; gap: 14px;
  }
  .modal-title { font-family: 'Orbitron', sans-serif; font-size: 14px; color: var(--accent); }
  .modal-box label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .modal-box input[type=text], .modal-box input[type=number] {
    background: var(--bg3); border: 1px solid var(--border); color: var(--text);
    padding: 8px 12px; border-radius: 8px; font-family: inherit; font-size: 14px; outline: none;
  }
  .modal-box input:focus { border-color: var(--accent); }
  .modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-cancel { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-family: inherit; }
  .btn-save { padding: 8px 20px; border-radius: 8px; border: none; background: var(--accent); color: #000; cursor: pointer; font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #060c14; }
  ::-webkit-scrollbar-thumb { background: #1a3040; border-radius: 3px; }
`;
