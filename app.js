"use strict";

const $ = (s) => document.querySelector(s);
const canvas = $("#canvas");
const NS = "http://www.w3.org/2000/svg";

let tasks = JSON.parse(localStorage.getItem("poster-tasks") || "[]");
let filter = "all";
let layers = JSON.parse(localStorage.getItem("poster-design") || "[]");
let selectedId = null;

function saveTasks() {
  localStorage.setItem("poster-tasks", JSON.stringify(tasks));
}
function saveDesign() {
  localStorage.setItem("poster-design", JSON.stringify(layers));
}
function id() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}
function download(name, contents, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contents], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Navigation
document.querySelectorAll(".tab").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll("main .panel").forEach(p => p.classList.add("hidden"));
    $("#" + button.dataset.tab).classList.remove("hidden");
  };
});

// Gestionnaire de tâches
function renderTasks() {
  const list = $("#task-list");
  list.replaceChildren();
  tasks.forEach((task, index) => {
    if (filter === "todo" && task.done) return;
    if (filter === "done" && !task.done) return;

    const li = document.createElement("li");
    li.className = task.done ? "done" : "";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = task.done;
    check.onchange = () => { task.done = check.checked; saveTasks(); renderTasks(); };

    const name = document.createElement("span");
    name.className = "task-name";
    name.textContent = task.name;
    name.ondblclick = () => {
      const edited = prompt("Modifier la tâche :", task.name);
      if (edited && edited.trim()) { task.name = edited.trim(); saveTasks(); renderTasks(); }
    };

    const edit = document.createElement("button");
    edit.textContent = "Modifier";
    edit.onclick = () => {
      const edited = prompt("Modifier la tâche :", task.name);
      if (edited && edited.trim()) { task.name = edited.trim(); saveTasks(); renderTasks(); }
    };

    const remove = document.createElement("button");
    remove.textContent = "Supprimer";
    remove.onclick = () => { tasks.splice(index, 1); saveTasks(); renderTasks(); };

    li.append(check, name, edit, remove);
    list.append(li);
  });
}
$("#task-form").onsubmit = (event) => {
  event.preventDefault();
  const input = $("#task-input");
  tasks.push({ name: input.value.trim(), done: false });
  input.value = "";
  saveTasks();
  renderTasks();
};
document.querySelectorAll("[data-filter]").forEach(b => {
  b.onclick = () => { filter = b.dataset.filter; renderTasks(); };
});

// Éditeur SVG
function createLayer(type) {
  const common = {
    id: id(), type, x: 80, y: 80, width: 240, height: 100,
    rotation: 0, opacity: 1, color: "#2878d0", stroke: "#172033",
    strokeWidth: 0, shadow: false, blur: 0, gradient: false,
    visible: true, locked: false, name: type
  };
  if (type === "text") Object.assign(common, {
    text: "Votre texte", font: "Arial", fontSize: 48, bold: true, italic: false
  });
  if (type === "circle") Object.assign(common, { width: 120, height: 120 });
  if (type === "image") Object.assign(common, { src: "" });
  layers.push(common);
  selectedId = common.id;
  renderEditor();
}

function makeSvgElement(layer) {
  let el;
  if (layer.type === "text") {
    el = document.createElementNS(NS, "text");
    el.setAttribute("x", layer.x);
    el.setAttribute("y", Number(layer.y) + Number(layer.fontSize));
    el.textContent = layer.text || "";
    el.setAttribute("font-family", layer.font || "Arial");
    el.setAttribute("font-size", layer.fontSize || 32);
    el.setAttribute("font-weight", layer.bold ? "bold" : "normal");
    el.setAttribute("font-style", layer.italic ? "italic" : "normal");
    el.setAttribute("fill", layer.color);
  } else if (layer.type === "image") {
    el = document.createElementNS(NS, "image");
    el.setAttribute("href", layer.src || "");
    el.setAttribute("x", layer.x); el.setAttribute("y", layer.y);
    el.setAttribute("width", layer.width); el.setAttribute("height", layer.height);
    el.setAttribute("preserveAspectRatio", "none");
  } else {
    el = document.createElementNS(NS, layer.type === "circle" ? "ellipse" : "rect");
    el.setAttribute("x", layer.x); el.setAttribute("y", layer.y);
    el.setAttribute("width", layer.width); el.setAttribute("height", layer.height);
    if (layer.type === "circle") {
      el.setAttribute("cx", Number(layer.x) + Number(layer.width) / 2);
      el.setAttribute("cy", Number(layer.y) + Number(layer.height) / 2);
      el.setAttribute("rx", Number(layer.width) / 2);
      el.setAttribute("ry", Number(layer.height) / 2);
      el.removeAttribute("x"); el.removeAttribute("y");
      el.removeAttribute("width"); el.removeAttribute("height");
    }
    el.setAttribute("fill", layer.gradient ? `url(#grad-${layer.id})` : layer.color);
  }

  el.setAttribute("opacity", layer.opacity);
  if (layer.strokeWidth > 0) {
    el.setAttribute("stroke", layer.stroke);
    el.setAttribute("stroke-width", layer.strokeWidth);
  }
  const filters = [];
  if (layer.shadow) filters.push("drop-shadow(4px 4px 4px #0008)");
  if (Number(layer.blur) > 0) filters.push(`blur(${layer.blur}px)`);
  if (filters.length) el.style.filter = filters.join(" ");
  if (Number(layer.rotation)) {
    const cx = Number(layer.x) + Number(layer.width) / 2;
    const cy = Number(layer.y) + Number(layer.height) / 2;
    el.setAttribute("transform", `rotate(${layer.rotation} ${cx} ${cy})`);
  }
  el.style.cursor = layer.locked ? "default" : "move";
  el.dataset.id = layer.id;
  el.addEventListener("pointerdown", startDrag);
  return el;
}

function renderEditor() {
  canvas.replaceChildren();
  const defs = document.createElementNS(NS, "defs");
  layers.filter(l => l.gradient).forEach(layer => {
    const grad = document.createElementNS(NS, "linearGradient");
    grad.id = `grad-${layer.id}`;
    const a = document.createElementNS(NS, "stop");
    a.setAttribute("offset", "0%"); a.setAttribute("stop-color", layer.color);
    const b = document.createElementNS(NS, "stop");
    b.setAttribute("offset", "100%"); b.setAttribute("stop-color", "#ffffff");
    grad.append(a, b); defs.append(grad);
  });
  canvas.append(defs);

  layers.forEach(layer => {
    if (!layer.visible) return;
    const el = makeSvgElement(layer);
    if (layer.id === selectedId) {
      el.setAttribute("class", "selected-layer");
      el.style.outline = "1px dashed #e22";
    }
    canvas.append(el);
  });
  renderLayerList();
  renderProperties();
  saveDesign();
}

let drag = null;
function startDrag(event) {
  const layer = layers.find(l => l.id === event.currentTarget.dataset.id);
  if (!layer || layer.locked) return;
  selectedId = layer.id;
  drag = {
    layer, startX: event.clientX, startY: event.clientY,
    x: Number(layer.x), y: Number(layer.y)
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  renderLayerList();
  renderProperties();
}
canvas.addEventListener("pointermove", event => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = 800 / rect.width;
  const scaleY = 600 / rect.height;
  drag.layer.x = Math.round(drag.x + (event.clientX - drag.startX) * scaleX);
  drag.layer.y = Math.round(drag.y + (event.clientY - drag.startY) * scaleY);
  renderEditor();
});
canvas.addEventListener("pointerup", () => { drag = null; });

function renderLayerList() {
  const list = $("#layer-list");
  list.replaceChildren();
  layers.forEach((layer, index) => {
    const li = document.createElement("li");
    li.className = layer.id === selectedId ? "selected" : "";
    const select = document.createElement("button");
    select.textContent = layer.name;
    select.onclick = () => { selectedId = layer.id; renderEditor(); };

    const actions = document.createElement("span");
    actions.className = "layer-actions";
    const visible = document.createElement("button");
    visible.textContent = layer.visible ? "◉" : "○";
    visible.title = "Afficher/masquer";
    visible.onclick = () => { layer.visible = !layer.visible; renderEditor(); };

    const lock = document.createElement("button");
    lock.textContent = layer.locked ? "🔒" : "🔓";
    lock.title = "Verrouiller/déverrouiller";
    lock.onclick = () => { layer.locked = !layer.locked; renderEditor(); };

    const up = document.createElement("button");
    up.textContent = "↑";
    up.title = "Monter";
    up.onclick = () => {
      if (index < layers.length - 1) [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
      renderEditor();
    };
    const down = document.createElement("button");
    down.textContent = "↓";
    down.title = "Descendre";
    down.onclick = () => {
      if (index > 0) [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
      renderEditor();
    };
    actions.append(visible, lock, up, down);
    li.append(select, actions);
    list.append(li);
  });
}

function renderProperties() {
  const box = $("#properties");
  box.replaceChildren();
  const layer = layers.find(l => l.id === selectedId);
  if (!layer) { box.textContent = "Sélectionnez un calque."; return; }

  const fields = [
    ["Nom", "name", "text"], ["X", "x", "number"], ["Y", "y", "number"],
    ["Largeur", "width", "number"], ["Hauteur", "height", "number"],
    ["Rotation", "rotation", "number"], ["Opacité", "opacity", "number"],
    ["Couleur", "color", "color"], ["Contour", "stroke", "color"],
    ["Épaisseur contour", "strokeWidth", "number"], ["Flou", "blur", "number"]
  ];
  if (layer.type === "text") fields.push(
    ["Texte", "text", "text"], ["Police", "font", "text"],
    ["Taille", "fontSize", "number"]
  );

  fields.forEach(([label, key, type]) => {
    const row = document.createElement("label");
    row.textContent = label + " ";
    const input = document.createElement("input");
    input.type = type;
    input.value = layer[key] ?? "";
    if (key === "opacity") { input.min = 0; input.max = 1; input.step = 0.05; }
    input.oninput = () => { layer[key] = type === "number" ? Number(input.value) : input.value; renderEditor(); };
    row.append(input); box.append(row);
  });

  [["Gras", "bold"], ["Italique", "italic"], ["Ombre", "shadow"], ["Dégradé", "gradient"]]
    .forEach(([label, key]) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox"; input.checked = Boolean(layer[key]);
      input.onchange = () => { layer[key] = input.checked; renderEditor(); };
      row.append(input, document.createTextNode(" " + label)); box.append(row);
    });
}

$("#add-text").onclick = () => createLayer("text");
$("#add-rect").onclick = () => createLayer("rect");
$("#add-circle").onclick = () => createLayer("circle");
$("#delete-layer").onclick = () => {
  layers = layers.filter(l => l.id !== selectedId);
  selectedId = null; renderEditor();
};

$("#image-file").onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const layer = {
      id: id(), type: "image", name: file.name, src: reader.result,
      x: 80, y: 80, width: 320, height: 220, rotation: 0,
      opacity: 1, color: "#ffffff", stroke: "#000000", strokeWidth: 0,
      blur: 0, shadow: false, gradient: false, visible: true, locked: false
    };
    layers.push(layer); selectedId = layer.id; renderEditor();
  };
  reader.readAsDataURL(file);
};

function svgText() {
  const clone = canvas.cloneNode(true);
  clone.setAttribute("xmlns", NS);
  return new XMLSerializer().serializeToString(clone);
}
$("#export-svg").onclick = () => download("affiche.svg", svgText(), "image/svg+xml");
$("#export-json").onclick = () => download("affiche.json", JSON.stringify(layers, null, 2), "application/json");

$("#export-png").onclick = () => {
  const blob = new Blob([svgText()], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const c = document.createElement("canvas");
    c.width = 800; c.height = 600;
    c.getContext("2d").drawImage(image, 0, 0);
    c.toBlob(png => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png); a.download = "affiche.png"; a.click();
    });
    URL.revokeObjectURL(url);
  };
  image.onerror = () => alert("Impossible de générer le PNG. Vérifiez les images importées.");
  image.src = url;
};

$("#json-file").onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("Format inattendu");
      layers = data; selectedId = layers[0]?.id || null; renderEditor();
    } catch {
      alert("Fichier JSON invalide.");
    }
  };
  reader.readAsText(file);
};

// Génère un script Photoshop simple : calques de texte et formes basiques.
$("#export-jsx").onclick = () => {
  const data = JSON.stringify(layers).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const jsx = `#target photoshop
app.bringToFront();
var data = eval('(' + '${data}' + ')');
var doc = app.documents.add(800, 600, 72, "Affiche", NewDocumentMode.RGB);
function hexColor(hex) {
  var c = new SolidColor();
  c.rgb.hexValue = hex.replace("#", "");
  return c;
}
for (var i = 0; i < data.length; i++) {
  var l = data[i];
  if (!l.visible) continue;
  if (l.type === "text") {
    var layer = doc.artLayers.add();
    layer.kind = LayerKind.TEXT;
    layer.name = l.name || "Texte";
    layer.textItem.contents = l.text || "";
    layer.textItem.position = [Number(l.x), Number(l.y) + Number(l.fontSize || 32)];
    layer.textItem.size = Number(l.fontSize || 32);
    layer.textItem.color = hexColor(l.color || "#000000");
    try { layer.textItem.font = l.font || "ArialMT"; } catch(e) {}
  } else if (l.type === "rect" || l.type === "circle") {
    // Forme simple remplie sur un calque séparé.
    var shape = doc.artLayers.add();
    shape.name = l.name || l.type;
    doc.selection.select([
      [Number(l.x), Number(l.y)],
      [Number(l.x) + Number(l.width), Number(l.y)],
      [Number(l.x) + Number(l.width), Number(l.y) + Number(l.height)],
      [Number(l.x), Number(l.y) + Number(l.height)]
    ]);
    doc.selection.fill(hexColor(l.color || "#2878d0"));
    doc.selection.deselect();
  } else {
    // Les images et dessins bitmap ne sont pas recréés par cette version du script.
  }
}
`;
  download("recreer-affiche.jsx", jsx, "text/plain");
};

renderTasks();
renderEditor();
