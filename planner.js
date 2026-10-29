const PLAN_KEY = 'nationfirst-floor-plan-v1';
const PLAN_DEFAULTS = { sofas: 2, tables: 6 };
const makePlanFurniture = (type, count) => Array.from({ length: count }, (_, index) => ({
  id: `${type === 'sofa' ? 'S' : 'T'}${index + 1}`,
  type
}));
const originalPlan = () => ({
  sofas: makePlanFurniture('sofa', 24),
  tables: makePlanFurniture('table', 56),
  seats: { ...PLAN_DEFAULTS }
});
let plan = originalPlan();
let planView = 'complete';
let planZoom = 1;
let editMode = false;
let selectedFurniture = null;
let selectedSeat = null;
let draggedFurniture = null;
const bookingSeatData = () => typeof db === 'undefined' ? {} : db.seats;
const organizerAccess = () => typeof isAdmin !== 'undefined' && isAdmin;

function validPlan(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sofas) || !Array.isArray(value.tables) || !value.seats) return false;
  const all = [...value.sofas, ...value.tables];
  if (value.sofas.length > 200 || value.tables.length > 200 || all.length === 0) return false;
  const ids = new Set();
  for (const [type, items] of [['sofa', value.sofas], ['table', value.tables]]) {
    for (const item of items) {
      if (!item || item.type !== type || typeof item.id !== 'string' ||
          !new RegExp(`^${type === 'sofa' ? 'S' : 'T'}[1-9]\\d*$`).test(item.id) || ids.has(item.id)) return false;
      ids.add(item.id);
    }
  }
  return ['sofa', 'table'].every(type => Number.isSafeInteger(value.seats[type === 'sofa' ? 'sofas' : 'tables']) &&
    value.seats[type === 'sofa' ? 'sofas' : 'tables'] >= 1 && value.seats[type === 'sofa' ? 'sofas' : 'tables'] <= 12);
}

try {
  const storedPlan = localStorage.getItem(PLAN_KEY);
  if (storedPlan) {
    const parsedPlan = JSON.parse(storedPlan);
    if (validPlan(parsedPlan)) plan = parsedPlan;
    else console.warn('Saved floor plan was invalid; the original layout has been restored.');
  }
} catch (error) {
  console.warn('Could not load the saved floor plan:', error);
}

function savePlan() {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    document.getElementById('planSaved').textContent = 'Saved on this device';
  } catch (error) {
    document.getElementById('planSaved').textContent = 'Could not save this layout';
    console.error('Could not save the floor plan:', error);
  }
}

function planCapacity() {
  return plan.sofas.length * plan.seats.sofas + plan.tables.length * plan.seats.tables;
}

function setPlanView(view) {
  if (!['complete', 'sofas', 'tables'].includes(view)) return;
  planView = view;
  renderPlanner();
}

function changeZoom(delta) {
  planZoom = Math.min(1.4, Math.max(0.7, Math.round((planZoom + delta) * 10) / 10));
  document.getElementById('zoomLabel').textContent = `${Math.round(planZoom * 100)}%`;
  document.getElementById('floorPlan').style.zoom = planZoom;
}

function toggleEditMode() {
  editMode = !editMode;
  document.getElementById('editToggle').classList.toggle('p', editMode);
  document.getElementById('editToggle').textContent = editMode ? '✓ Done editing' : '✎ Edit layout';
  document.getElementById('editPanel').hidden = !editMode;
  renderPlanner();
}

function setSeatCount(type, input) {
  const key = type === 'sofa' ? 'sofas' : 'tables';
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 12) {
    input.value = plan.seats[key];
    input.setCustomValidity('Enter a whole number from 1 to 12.');
    input.reportValidity();
    input.setCustomValidity('');
    return;
  }
  plan.seats[key] = value;
  savePlan();
  renderPlanner();
}

function addFurniture(type) {
  const items = type === 'sofa' ? plan.sofas : plan.tables;
  if (items.length >= 200) {
    alert(`A maximum of 200 ${type}s can be added to one layout.`);
    return;
  }
  let number = 1;
  const used = new Set(items.map(item => item.id));
  while (used.has(`${type === 'sofa' ? 'S' : 'T'}${number}`)) number++;
  items.push({ id: `${type === 'sofa' ? 'S' : 'T'}${number}`, type });
  selectedFurniture = items.at(-1).id;
  savePlan();
  renderPlanner();
}

function removeSelected() {
  if (!editMode || !selectedFurniture) return;
  const type = selectedFurniture[0] === 'S' ? 'sofa' : 'table';
  const items = type === 'sofa' ? plan.sofas : plan.tables;
  const bookingSeats = bookingSeatData();
  const booked = Object.keys(bookingSeats).filter(key => key.startsWith(`${selectedFurniture}-`)).length;
  if (booked > 0) {
    alert('Cancel or move this furniture’s guest bookings before removing it from the plan.');
    return;
  }
  const index = items.findIndex(item => item.id === selectedFurniture);
  if (index < 0) return;
  items.splice(index, 1);
  selectedFurniture = null;
  savePlan();
  renderPlanner();
}

function moveSelected(direction) {
  if (!editMode || !selectedFurniture) return;
  const items = selectedFurniture[0] === 'S' ? plan.sofas : plan.tables;
  const index = items.findIndex(item => item.id === selectedFurniture);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
  savePlan();
  renderPlanner();
}

function resetPlan() {
  if (!confirm('Restore the original layout of 24 sofas and 56 tables? This replaces your saved floor plan.')) return;
  plan = originalPlan();
  selectedFurniture = null;
  document.getElementById('sofaSeatInput').value = plan.seats.sofas;
  document.getElementById('tableSeatInput').value = plan.seats.tables;
  savePlan();
  renderPlanner();
}

function selectFurniture(id) {
  selectedFurniture = id;
  selectedSeat = null;
  renderPlanner();
}

function selectPlanSeat(event, id, seatNumber) {
  event.stopPropagation();
  if (editMode) return;
  selectedFurniture = id;
  selectedSeat = seatNumber;
  renderPlanner();
  if (window.matchMedia('(max-width: 760px)').matches) {
    document.querySelector('.detail-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function isBookableSeat(id, seatNumber) {
  const unit = typeof units === 'undefined' ? null : units.find(item => item.id === id);
  return Boolean(unit && seatNumber >= 1 && seatNumber <= unit.cap);
}

function seatIndicatorMarkup(item, seatNumber, isSofa) {
  const seatKey = `${item.id}-${seatNumber}`;
  const booking = bookingSeatData()[seatKey];
  const state = booking ? 'booked' : 'available';
  const name = booking ? `, booked by ${booking.name}` : ', available';
  const typeClass = isSofa ? 'sofa-cushion' : 'table-seat';
  const angle = isSofa ? '' : ` style="--seat-angle:${360 * (seatNumber - 1) / (plan.seats.tables || 1)}deg"`;
  return `<button type="button" class="seat-indicator ${typeClass} ${state}${selectedFurniture === item.id && selectedSeat === seatNumber ? ' focused' : ''}" aria-label="Seat ${seatNumber}${name}" title="Seat ${seatNumber}${name}" onclick="selectPlanSeat(event,'${item.id}',${seatNumber})"${angle}></button>`;
}

function furnitureMarkup(item, index) {
  const sofa = item.type === 'sofa';
  const seats = sofa ? plan.seats.sofas : plan.seats.tables;
  const bookingSeats = bookingSeatData();
  const occupied = Object.keys(bookingSeats).filter(key => key.startsWith(`${item.id}-`)).length;
  const seatsMarkup = sofa
    ? `<span class="sofa-visual" style="--seat-count:${seats}">${Array.from({ length: seats }, (_, seat) => seatIndicatorMarkup(item, seat + 1, true)).join('')}</span>`
    : `<span class="table-visual" style="--seat-count:${seats}"><i class="table-top"></i>${Array.from({ length: seats }, (_, seat) => seatIndicatorMarkup(item, seat + 1, false)).join('')}</span>`;
  const fullyBooked = occupied >= seats;
  return `<div class="furniture-item ${sofa ? 'sofa-item' : 'table-item'}${occupied ? ' has-bookings' : ''}${fullyBooked ? ' fully-booked' : ''}${selectedFurniture === item.id ? ' selected' : ''}${draggedFurniture === item.id ? ' dragging' : ''}" draggable="${editMode}" data-type="${item.type}" data-index="${index}" role="group" aria-label="${sofa ? 'Sofa' : 'Table'} ${item.id.slice(1)}, ${seats} seats${occupied ? `, ${occupied} booked` : ''}" onclick="selectFurniture('${item.id}')" ondragstart="startFurnitureDrag(event,'${item.id}')" ondragend="endFurnitureDrag()" ondragover="allowFurnitureDrop(event)" ondrop="dropFurniture(event,'${item.type}',${index})">${seatsMarkup}<span class="furniture-label">${sofa ? 'Sofa' : 'Table'} ${item.id.slice(1)}</span><span class="furniture-capacity">${seats - occupied} available · ${seats} seats</span>${occupied ? `<span class="booking-mark">${occupied} booked</span>` : ''}</div>`;
}

function renderSofas() {
  const rows = [];
  for (let start = 0; start < plan.sofas.length; start += 8) {
    const row = plan.sofas.slice(start, start + 8);
    const left = row.slice(0, 4).map((item, index) => furnitureMarkup(item, start + index)).join('');
    const right = row.slice(4).map((item, index) => furnitureMarkup(item, start + 4 + index)).join('');
    rows.push(`<div class="plan-row"><span class="row-label">Row ${rows.length + 1}</span><div class="sofa-items">${left}<span class="aisle" aria-label="Central aisle">Aisle</span>${right}</div></div>`);
  }
  return rows.join('');
}

function renderTables() {
  const rows = [];
  for (let start = 0; start < plan.tables.length; start += 7) {
    const row = plan.tables.slice(start, start + 7);
    rows.push(`<div class="plan-row"><span class="row-label">Row ${rows.length + 1}</span><div class="table-items">${row.map((item, index) => furnitureMarkup(item, start + index)).join('')}</div></div>`);
  }
  return rows.join('');
}

function renderDetails() {
  const detail = document.getElementById('selectionDetails');
  const actions = document.getElementById('detailActions');
  const item = [...plan.sofas, ...plan.tables].find(furniture => furniture.id === selectedFurniture);
  actions.hidden = !item || !editMode;
  if (!item) {
    detail.className = 'selection-empty';
    detail.textContent = 'Select an available seat to book one guest at a time.';
    return;
  }
  const isSofa = item.type === 'sofa';
  const capacity = plan.seats[isSofa ? 'sofas' : 'tables'];
  const bookings = bookingSeatData();
  const bookingCapacity = isSofa ? 2 : 6;
  const currentBooking = selectedSeat ? bookings[`${item.id}-${selectedSeat}`] : null;
  const bookable = selectedSeat && selectedSeat <= bookingCapacity && isBookableSeat(item.id, selectedSeat);
  detail.className = '';
  const seatButtons = Array.from({ length: capacity }, (_, index) => {
    const seatNumber = index + 1;
    const booking = bookings[`${item.id}-${seatNumber}`];
    return `<button type="button" class="selection-seat ${isSofa ? '' : 'table'}${booking ? ' booked' : ''}${selectedSeat === seatNumber ? ' focused' : ''}" aria-label="Seat ${seatNumber}${booking ? ` booked by ${booking.name}` : ' available'}" onclick="selectPlanSeat(event,'${item.id}',${seatNumber})">${seatNumber}</button>`;
  }).join('');
  let bookingPanel = '';
  if (selectedSeat && currentBooking) {
    bookingPanel = `<div class="booking-status is-booked"><b>Seat ${selectedSeat} is booked</b><span>${esc(currentBooking.name)}${organizerAccess() && currentBooking.phone ? ` · ${esc(currentBooking.phone)}` : ''}</span><button type="button" onclick="openM('${item.id}')">Manage booking</button></div>`;
  } else if (selectedSeat && !bookable) {
    bookingPanel = `<div class="booking-status"><b>Seat ${selectedSeat} isn’t in the booking inventory</b><span>Bookings use the original 2-seat sofa and 6-seat table capacities.</span></div>`;
  } else if (selectedSeat && bookable && !editMode) {
    bookingPanel = `<form class="quick-booking" onsubmit="bookPlanSeat(event)"><b>Book seat ${selectedSeat} · one guest</b><label>Guest name<input id="planGuestName" name="guestName" autocomplete="name" maxlength="120" placeholder="Enter guest name" required></label>${organizerAccess() ? '<label>Guest phone number <input id="planGuestPhone" name="guestPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" placeholder="Enter phone number"></label>' : '<p class="phone-access-note">Guest phone numbers are only visible to signed-in organizers.</p>'}<button type="submit" class="p">Book this seat</button></form>`;
  }
  detail.innerHTML = `<div class="selection-title">${isSofa ? 'Sofa' : 'Table'} ${item.id.slice(1)}</div><div class="selection-type">${isSofa ? 'Lounge seating' : 'Round-table seating'} · ${capacity} seats</div><div class="selection-seats" aria-label="${capacity} selectable seats">${seatButtons}</div><div class="seat-guide"><span><i class="seat-key available"></i>Available</span><span><i class="seat-key booked"></i>Booked</span></div>${bookingPanel}`;
}

function bookPlanSeat(event) {
  event.preventDefault();
  if (!selectedFurniture || !selectedSeat || editMode) return;
  const seatKey = `${selectedFurniture}-${selectedSeat}`;
  if (!isBookableSeat(selectedFurniture, selectedSeat) || bookingSeatData()[seatKey]) {
    renderPlanner();
    return;
  }
  const nameInput = document.getElementById('planGuestName');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  const phoneInput = document.getElementById('planGuestPhone');
  db.seats[seatKey] = {
    name,
    phone: organizerAccess() && phoneInput ? phoneInput.value.trim() : '',
    pass: null
  };
  save();
  render();
}

function renderPlanner() {
  const capacity = planCapacity();
  document.getElementById('statSofas').textContent = plan.sofas.length;
  document.getElementById('statSofaSeats').textContent = plan.seats.sofas;
  document.getElementById('statSofaCapacity').textContent = plan.sofas.length * plan.seats.sofas;
  document.getElementById('statTables').textContent = plan.tables.length;
  document.getElementById('statTableSeats').textContent = plan.seats.tables;
  document.getElementById('statTableCapacity').textContent = plan.tables.length * plan.seats.tables;
  document.getElementById('statTotal').textContent = capacity;
  document.getElementById('planUtilization').textContent = `${plan.sofas.length + plan.tables.length} units`;
  document.getElementById('planSeats').textContent = `${capacity} seats`;
  document.getElementById('sofaSeatInput').value = plan.seats.sofas;
  document.getElementById('tableSeatInput').value = plan.seats.tables;
  document.getElementById('floorTitle').textContent = planView === 'sofas' ? 'Sofa seating layout' : planView === 'tables' ? 'Table seating layout' : 'Complete event layout';
  document.getElementById('floorSubtitle').textContent = `${Math.ceil(plan.sofas.length / 8)} sofa rows · ${Math.ceil(plan.tables.length / 7)} table rows`;
  document.querySelectorAll('.view-button').forEach(button => button.classList.toggle('active', button.dataset.view === planView));
  const sofaSection = document.getElementById('sofaSection');
  const tableSection = document.getElementById('tableSection');
  sofaSection.hidden = planView === 'tables';
  tableSection.hidden = planView === 'sofas';
  sofaSection.querySelector('.plan-section-title').textContent = `Sofas · ${plan.sofas.length} units · ${plan.sofas.length * plan.seats.sofas} seats`;
  tableSection.querySelector('.plan-section-title').textContent = `Tables · ${plan.tables.length} units · ${plan.tables.length * plan.seats.tables} seats`;
  sofaSection.querySelector('.section-rows').innerHTML = renderSofas();
  tableSection.querySelector('.section-rows').innerHTML = renderTables();
  document.getElementById('floorPlan').style.zoom = planZoom;
  document.getElementById('zoomLabel').textContent = `${Math.round(planZoom * 100)}%`;
  renderDetails();
}

function startFurnitureDrag(event, id) {
  if (!editMode) {
    event.preventDefault();
    return;
  }
  draggedFurniture = id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
}

function allowFurnitureDrop(event) {
  if (editMode) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }
}

function dropFurniture(event, type, targetIndex) {
  event.preventDefault();
  if (!editMode) return;
  const sourceId = event.dataTransfer.getData('text/plain');
  if (!sourceId || sourceId[0] !== (type === 'sofa' ? 'S' : 'T')) return;
  const items = type === 'sofa' ? plan.sofas : plan.tables;
  const sourceIndex = items.findIndex(item => item.id === sourceId);
  if (sourceIndex < 0 || sourceIndex === targetIndex) return;
  [items[sourceIndex], items[targetIndex]] = [items[targetIndex], items[sourceIndex]];
  selectedFurniture = sourceId;
  savePlan();
  renderPlanner();
}

function endFurnitureDrag() {
  draggedFurniture = null;
}

function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filePrefix() {
  const event = document.getElementById('ev').value.trim() || 'event';
  return event.replace(/[^a-z0-9_-]+/gi, '_');
}

function downloadSummary() {
  const summary = [
    'EVENT SEATING SUMMARY',
    `Event: ${document.getElementById('ev').value.trim() || 'Event Nation'}`,
    `Sofas: ${plan.sofas.length}`,
    `Seats per sofa: ${plan.seats.sofas}`,
    `Sofa capacity: ${plan.sofas.length * plan.seats.sofas}`,
    `Tables: ${plan.tables.length}`,
    `Seats per table: ${plan.seats.tables}`,
    `Table capacity: ${plan.tables.length * plan.seats.tables}`,
    `Total seating capacity: ${planCapacity()} people`
  ].join('\n');
  downloadFile(`${filePrefix()}_seating_summary.txt`, new Blob([summary], { type: 'text/plain;charset=utf-8' }));
}

function downloadPlanPng() {
  const sofaRows = planView === 'tables' ? [] : Array.from({ length: Math.ceil(plan.sofas.length / 8) }, (_, row) => plan.sofas.slice(row * 8, row * 8 + 8));
  const tableRows = planView === 'sofas' ? [] : Array.from({ length: Math.ceil(plan.tables.length / 7) }, (_, row) => plan.tables.slice(row * 7, row * 7 + 7));
  const width = 1260;
  const header = 130;
  const rowHeight = 126;
  const sectionSpace = sofaRows.length && tableRows.length ? 56 : 0;
  const rowsHeight = (sofaRows.length + tableRows.length) * rowHeight + sectionSpace;
  const height = header + Math.max(rowHeight, rowsHeight) + 60;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = '#fbfcfe';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#172d4d';
  context.font = '700 25px system-ui, sans-serif';
  context.fillText(document.getElementById('ev').value.trim() || 'Event seating plan', 42, 44);
  context.fillStyle = '#74839a';
  context.font = '13px system-ui, sans-serif';
  context.fillText(`${plan.sofas.length} sofas · ${plan.tables.length} tables · ${planCapacity()} seats`, 42, 69);
  context.fillText(planView === 'sofas' ? 'Sofa layout' : planView === 'tables' ? 'Table layout' : 'Complete seating layout', 42, 94);

  function roundedRect(x, y, w, h, radius, fill, stroke) {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.stroke();
  }

  function drawRow(items, type, rowNumber, y) {
    const sofa = type === 'sofa';
    context.fillStyle = '#78869b';
    context.font = '700 12px system-ui, sans-serif';
    context.fillText(`ROW ${rowNumber}`, 42, y + 42);
    const cellW = sofa ? 112 : 164;
    const startX = sofa ? 132 : 125;
    items.forEach((item, index) => {
      const position = sofa && index >= 4 ? index + 1 : index;
      const x = startX + position * cellW;
      const fill = sofa ? '#f1f5fb' : '#fff8f2';
      const stroke = sofa ? '#dbe4f0' : '#edd9ca';
      roundedRect(x, y + 5, sofa ? 92 : 142, 100, 10, fill, stroke);
      if (sofa) {
        roundedRect(x + 21, y + 20, 50, 30, 7, '#dce7f3', '#6b83a5');
        context.fillStyle = '#6b83a5';
        context.fillRect(x + 18, y + 37, 5, 15);
        context.fillRect(x + 69, y + 37, 5, 15);
        for (let seat = 0; seat < plan.seats.sofas; seat++) {
          context.beginPath();
          context.arc(x + 34 + seat * 23, y + 34, 7, 0, Math.PI * 2);
          context.fillStyle = '#9eb2cc';
          context.fill();
        }
      } else {
        const cx = x + 71;
        const cy = y + 39;
        for (let seat = 0; seat < plan.seats.tables; seat++) {
          const angle = (Math.PI * 2 * seat) / plan.seats.tables - Math.PI / 2;
          context.beginPath();
          context.arc(cx + Math.cos(angle) * 30, cy + Math.sin(angle) * 27, 5, 0, Math.PI * 2);
          context.fillStyle = '#fff';
          context.fill();
          context.strokeStyle = '#d39a72';
          context.stroke();
        }
        roundedRect(cx - 23, cy - 15, 46, 30, 7, '#f8e9dc', '#d39a72');
      }
      context.fillStyle = '#273d5b';
      context.font = '700 12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(`${sofa ? 'Sofa' : 'Table'} ${item.id.slice(1)}`, x + (sofa ? 46 : 71), y + 72);
      context.fillStyle = '#8491a4';
      context.font = '10px system-ui, sans-serif';
      context.fillText(`${sofa ? plan.seats.sofas : plan.seats.tables} seats`, x + (sofa ? 46 : 71), y + 88);
      context.textAlign = 'left';
    });
    if (sofa && items.length > 4) {
      context.strokeStyle = '#aab5c5';
      context.setLineDash([3, 4]);
      context.beginPath();
      context.moveTo(132 + 4 * cellW + 46, y + 15);
      context.lineTo(132 + 4 * cellW + 46, y + 91);
      context.stroke();
      context.setLineDash([]);
    }
  }

  let y = header;
  for (let row = 0; row < sofaRows.length; row++) drawRow(sofaRows[row], 'sofa', row + 1, y + row * rowHeight);
  y += sofaRows.length * rowHeight;
  if (sofaRows.length && tableRows.length) {
    context.strokeStyle = '#dce3ed';
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(42, y + 20);
    context.lineTo(width - 42, y + 20);
    context.stroke();
    context.setLineDash([]);
    y += sectionSpace;
  }
  for (let row = 0; row < tableRows.length; row++) drawRow(tableRows[row], 'table', row + 1, y + row * rowHeight);
  context.fillStyle = '#8491a4';
  context.font = '11px system-ui, sans-serif';
  context.fillText('Sofa central aisle shown between groups of four.', 42, height - 19);
  canvas.toBlob(blob => {
    if (blob) downloadFile(`${filePrefix()}_seating_layout.png`, blob);
    else alert('The seating layout image could not be created.');
  }, 'image/png');
}

function printPlan() {
  window.print();
}

async function togglePresentation() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    alert(`Could not enter presentation mode: ${error.message}`);
  }
}

document.getElementById('sofaSeatInput').addEventListener('change', event => setSeatCount('sofa', event.target));
document.getElementById('tableSeatInput').addEventListener('change', event => setSeatCount('table', event.target));
document.addEventListener('fullscreenchange', () => document.body.classList.toggle('presentation', Boolean(document.fullscreenElement)));
renderPlanner();
