import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getSchedulerData from '@salesforce/apex/SchedulerController.getSchedulerData';
import updateShiftAssignment from '@salesforce/apex/SchedulerController.updateShiftAssignment';
import createOrUpdateShift from '@salesforce/apex/SchedulerController.createOrUpdateShift';
import deleteShift from '@salesforce/apex/SchedulerController.deleteShift';
import bulkUpdateShifts from '@salesforce/apex/SchedulerController.bulkUpdateShifts';
import resizeShiftDuration from '@salesforce/apex/SchedulerController.resizeShiftDuration';
import updateShiftLabel from '@salesforce/apex/SchedulerController.updateShiftLabel';

export default class SchedulerGrid extends LightningElement {

    // --- NEW: Admin Context State ---
    @track adminContactId; // Extracted from URL ?adminId=xxx
    @track currentExpertise; // Returned from Apex

    @track dateHeaders    = [];
    @track gridData       = [];
    @track isModalOpen    = false;
    @track searchTerm     = '';
    @track displayMode    = 'Grid';
    @track viewMode       = 'Weekly'; 
    @track isHeatMapMode  = false;
    @track currentStartDate = new Date();
    @track groupBy        = 'Department';
    @track copiedShift    = null;
    @track inlineEditShiftId = null;

    // Pagination State
    @track currentPage    = 1;
    @track recordsPerPage = 10;
    @track totalRecords   = 0;
    @track totalPages     = 1;

    // Modal and Bulk Edit State
    @track selectedShiftIds  = [];
    @track isBulkModalOpen   = false;
    @track bulkStatus        = '';
    @track bulkType          = '';
    @track bulkLocationId    = null;
    
    @track selectedShiftId   = null;
    @track selectedDate;
    @track selectedContactId;
    @track shiftDescription  = '';
    @track selectedType      = 'Regular';
    @track selectedStatus    = 'Draft';
    @track selectedLocationId = null;
    @track startTime         = '09:00:00.000';
    @track endTime           = '17:00:00.000';

    @track resizeTooltip = { visible: false, text: '', style: '' };
    @track isDeleteConfirmOpen = false;
    pendingDeleteId = null;

    @track hoverCard = { visible: false };
    _hoverTimeout  = null;
    _hoverShiftId  = null;

    wiredResult;
    allContacts   = [];
    allShifts     = [];
    @track locationOptions = [];

    @track isDashboardOpen = false;
    @track dashboardData = { dateStr: '', contactName: '', shifts: [] };

    // Interaction State Trackers
    _isResizing = false; 
    _resizeStartX = 0; 
    _resizeStartWidth = 0; 
    _resizingShiftId = null; 
    _resizingEl = null;
    
    @track isCutAction = false; 
    cutShiftId = null; 
    actionHistory = []; 
    @track isUndoDisabled = true;
    
    _isDrawing = false; 
    _drawStartX = 0; 
    _drawStartCell = null; 
    @track ghostStyle = ''; 
    @track activeGhostId = null;

    _dragStartClientX      = 0;
    _dragStartMinuteOffset = 0; 

    // Configuration Options mapped to Salesforce Picklists
    typeOptions = [
        { label: '🌅 Morning Shift', value: 'Morning'  },
        { label: '☀️ Regular Shift', value: 'Regular'  },
        { label: '🌙 Night Shift',   value: 'Night'    },
        { label: '🎉 Special Event', value: 'Event'    },
        { label: '🏖 Time Off',      value: 'Time Off' }
    ];

    _typeClassMap = {
        'Morning':  'shift-morning',
        'Regular':  'shift-general',
        'Night':    'shift-night',
        'Event':    'shift-event',
        'Time Off': 'shift-timeoff'
    };

    statusOptions = [
        { label: 'Draft',     value: 'Draft'     },
        { label: 'Published', value: 'Published' },
        { label: 'Confirmed', value: 'Confirmed' }
    ];

    // --- NEW: Recurrence State ---
    @track isRecurring = false;
    @track recurrencePattern = 'Weekly';
    @track recurrenceEndDate = null;
    @track selectedDays = []; // Tracks the checkboxes
    @track customDays = [
        { label: 'Mon', value: 'Mon', cssClass: 'day-pill' },
        { label: 'Tue', value: 'Tue', cssClass: 'day-pill' },
        { label: 'Wed', value: 'Wed', cssClass: 'day-pill' },
        { label: 'Thu', value: 'Thu', cssClass: 'day-pill' },
        { label: 'Fri', value: 'Fri', cssClass: 'day-pill' },
        { label: 'Sat', value: 'Sat', cssClass: 'day-pill' },
        { label: 'Sun', value: 'Sun', cssClass: 'day-pill' }
    ];

    patternOptions = [
        { label: 'Daily', value: 'Daily' },
        { label: 'Weekly', value: 'Weekly' },
        { label: 'Bi-Weekly', value: 'Bi-Weekly' },
        { label: 'Custom Weekly', value: 'Custom Weekly' },
        { label: '4-ON-2-OFF', value: '4-ON-2-OFF' }
    ];

    get isCustomPattern() { return this.recurrencePattern === 'Custom Weekly'; }
    get groupByOptions()        { return [{ label: 'Group by Team', value: 'Department' }, { label: 'Group by Location', value: 'Location' }]; }
    get recordsPerPageOptions() { return [{ label: '5 per page', value: '5' }, { label: '10 per page', value: '10' }, { label: '20 per page', value: '20' }, { label: '50 per page', value: '50' }, { label: 'View All', value: '1000' }]; }

    get isFirstPage()        { return this.currentPage <= 1; }
    get isLastPage()         { return this.currentPage >= this.totalPages || this.totalPages === 0; }
    get pageIndicatorLabel() { return `Page ${this.currentPage} of ${this.totalPages || 1}`; }
    get paginationStart()    { return this.totalRecords === 0 ? 0 : (this.currentPage - 1) * this.recordsPerPage + 1; }
    get paginationEnd()      { return Math.min(this.currentPage * this.recordsPerPage, this.totalRecords); }
    get isGridView()         { return this.displayMode === 'Grid'; }
    get isAgendaView()       { return this.displayMode === 'Agenda'; }
    get gridButtonVariant()  { return this.displayMode === 'Grid'   ? 'brand' : 'neutral'; }
    get agendaButtonVariant(){ return this.displayMode === 'Agenda' ? 'brand' : 'neutral'; }
    get dailyButtonVariant() { return this.viewMode === 'Daily'     ? 'brand' : 'neutral'; }
    get weeklyButtonVariant(){ return this.viewMode === 'Weekly'    ? 'brand' : 'neutral'; }
    get monthlyButtonVariant(){ return this.viewMode === 'Monthly'  ? 'brand' : 'neutral'; }
    get heatMapVariant()     { return this.isHeatMapMode            ? 'brand' : 'neutral'; }
    get modalHeader()        { return this.selectedShiftId ? 'Edit Schedule Item' : 'Create New Schedule Item'; }
    get isShiftCopied()      { return this.copiedShift !== null; }
    get hasSelectedShifts()  { return this.selectedShiftIds.length > 0; }
    get selectedShiftsCount(){ return this.selectedShiftIds.length; }
    get isCutActive()        { return this.isCutAction && this.copiedShift !== null; }

    get rowCssClass() {
        if (this.viewMode === 'Daily')   return 'resource-row daily-row';
        if (this.viewMode === 'Monthly') return 'resource-row monthly-row';
        return 'resource-row';
    }

    get formattedCurrentDate() {
        if (!this.currentStartDate) return '';
        const y = this.currentStartDate.getFullYear();
        const m = String(this.currentStartDate.getMonth() + 1).padStart(2, '0');
        const d = String(this.currentStartDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _formatTimeForInput(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return '09:00:00.000';
        const h = String(dateObj.getHours()).padStart(2, '0');
        const m = String(dateObj.getMinutes()).padStart(2, '0');
        return `${h}:${m}:00.000`;
    }

    connectedCallback() {
        // --- ADMIN VALIDATION: Read the adminId from the visualforce page URL ---
        const urlParams = new URLSearchParams(window.location.search);
        this.adminContactId = urlParams.get('adminId');

        if (!this.adminContactId) {
            this.showToast('Authentication Error', 'No Admin ID detected in the URL.', 'error');
        }

        const d = new Date();
        const day = d.getDay();
        d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        this.currentStartDate = new Date(d);
        this.currentStartDate.setHours(0, 0, 0, 0);
        this.generateDateHeaders();
    }

    // --- DYNAMIC WIRE: Automatically re-fetches when adminContactId populates ---
    @wire(getSchedulerData, { adminId: '$adminContactId' })
    wiredData(result) {
        this.wiredResult = result;
        if (result.data) {
            this.allContacts = [...result.data.contacts];
            this.allShifts   = [...result.data.shifts];
            this.currentExpertise = result.data.adminSpecialty; // Used in UI Header
            if (result.data.locations) {
                this.locationOptions = result.data.locations.map(l => ({ label: l.Name, value: l.Id }));
            }
            this.buildGrid();
        } else if (result.error) {
            console.error('Data Load Error:', result.error);
            this.showToast('Access Denied', 'Unable to authenticate Admin ID or load data.', 'error');
        }
    }

    handleRecordsPerPageChange(e) { this.recordsPerPage = parseInt(e.target.value, 10); this.currentPage = 1; this.buildGrid(); }
    handlePrevPage() { if (this.currentPage > 1) { this.currentPage--; this.buildGrid(); } }
    handleNextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; this.buildGrid(); } }

    switchToGrid()   { this.displayMode = 'Grid'; }
    switchToAgenda() { this.displayMode = 'Agenda'; }
    toggleHeatMap()  { this.isHeatMapMode = !this.isHeatMapMode; this.buildGrid(); }
    handleGroupByChange(e) { this.groupBy = e.detail.value; this.buildGrid(); }

    handleDatePick(e) {
        const v = e.target.value;
        if (!v) return;
        const [y, m, d] = v.split('-');
        this.currentStartDate = new Date(y, m - 1, d, 0, 0, 0, 0);
        this.generateDateHeaders(); this.buildGrid();
    }

    handlePrevious() {
        if (this.viewMode === 'Monthly') this.currentStartDate.setMonth(this.currentStartDate.getMonth() - 1);
        else this.currentStartDate.setDate(this.currentStartDate.getDate() - (this.viewMode === 'Daily' ? 1 : 7));
        this.generateDateHeaders(); this.buildGrid();
    }

    handleNext() {
        if (this.viewMode === 'Monthly') this.currentStartDate.setMonth(this.currentStartDate.getMonth() + 1);
        else this.currentStartDate.setDate(this.currentStartDate.getDate() + (this.viewMode === 'Daily' ? 1 : 7));
        this.generateDateHeaders(); this.buildGrid();
    }

    handleToday() {
        const d = new Date();
        if (this.viewMode === 'Weekly') {
            const day = d.getDay();
            d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        } else if (this.viewMode === 'Monthly') {
            d.setDate(1);
        }
        this.currentStartDate = new Date(d);
        this.currentStartDate.setHours(0, 0, 0, 0);
        this.generateDateHeaders(); this.buildGrid();
    }

    switchToDaily()  { this.viewMode = 'Daily';  this.generateDateHeaders(); this.buildGrid(); }
    switchToWeekly() {
        this.viewMode = 'Weekly';
        const d = new Date(this.currentStartDate);
        const day = d.getDay();
        d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        this.currentStartDate = new Date(d);
        this.generateDateHeaders(); this.buildGrid();
    }
    switchToMonthly() {
        this.viewMode = 'Monthly';
        const d = new Date(this.currentStartDate);
        d.setDate(1);
        this.currentStartDate = new Date(d);
        this.generateDateHeaders(); this.buildGrid();
    }

    generateDateHeaders() {
        const headers  = [];
        const base     = new Date(this.currentStartDate);
        const todayStr = new Date().toISOString().split('T')[0];

        if (this.viewMode === 'Weekly') {
            for (let i = 0; i < 7; i++) {
                const d = new Date(base); d.setDate(base.getDate() + i);
                const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                headers.push({
                    columnId: iso, dateValue: iso, hourValue: null,
                    display: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    headerCellClass: iso === todayStr ? 'header-cell header-cell-today' : 'header-cell',
                    todayLabelClass: iso === todayStr ? 'today-label' : ''
                });
            }
        } else if (this.viewMode === 'Daily') {
            const iso = `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
            for (let i = 0; i < 24; i++) {
                const lbl = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i-12} PM`;
                headers.push({
                    columnId: `${iso}-${i}`, dateValue: iso, hourValue: i, display: lbl,
                    headerCellClass: iso === todayStr ? 'header-cell daily-header-cell header-cell-today' : 'header-cell daily-header-cell',
                    todayLabelClass: iso === todayStr ? 'today-label' : ''
                });
            }
        } else if (this.viewMode === 'Monthly') {
            const y = base.getFullYear(), m = base.getMonth();
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(y, m, i);
                const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                headers.push({
                    columnId: iso, dateValue: iso, hourValue: null,
                    display: `${d.getDate()} ${d.toLocaleDateString('en-US', { weekday: 'narrow' })}`,
                    headerCellClass: iso === todayStr ? 'header-cell monthly-header-cell header-cell-today' : 'header-cell monthly-header-cell',
                    todayLabelClass: iso === todayStr ? 'today-label' : ''
                });
            }
        }
        this.dateHeaders = headers;
    }

    handleSearch(e) { this.searchTerm = e.target.value.toLowerCase(); this.currentPage = 1; this.buildGrid(); }

    _shortDesc(text) {
        if (!text) return '';
        const w = text.trim().split(/\s+/);
        return w.length <= 2 ? text : w.slice(0, 2).join(' ') + '…';
    }

    _hasConflict(shift, allShiftsForContact) {
        const sStart = new Date(shift.StartTime).getTime();
        const sEnd   = new Date(shift.EndTime).getTime();
        return allShiftsForContact.some(other => {
            if (other.Id === shift.Id) return false;
            const oStart = new Date(other.StartTime).getTime();
            const oEnd   = new Date(other.EndTime).getTime();
            return Math.max(sStart, oStart) < Math.min(sEnd, oEnd);
        });
    }

    buildGrid() {
        if (!this.allContacts || !this.dateHeaders) return;

        const todayStr    = new Date().toISOString().split('T')[0];
        const isDailyView = this.viewMode === 'Daily';
        const isMonthly   = this.viewMode === 'Monthly';
        const lMap        = new Map(this.locationOptions.map(l => [l.value, l.label]));
        const cMap        = new Map(this.allContacts.map(c => [c.Id, c]));

        const filtered = this.allContacts.filter(c => c.Name.toLowerCase().includes(this.searchTerm));
        this.totalRecords = filtered.length;
        this.totalPages   = Math.ceil(this.totalRecords / this.recordsPerPage) || 1;
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;

        const start    = (this.currentPage - 1) * this.recordsPerPage;
        const contacts = filtered.slice(start, start + this.recordsPerPage);

        const grouped = {};

        contacts.forEach(contact => {
            const groupName = this.groupBy === 'Department'
                ? (contact.Department__c || 'Unassigned Team')
                : (contact.Primary_Location__r?.Name || 'Unassigned Location');
            if (!grouped[groupName]) grouped[groupName] = { groupName, contacts: [] };

            let confirmedMs = 0, draftMs = 0;
            const myShifts  = this.allShifts.filter(s => s.Contact__c === contact.Id);

            myShifts.forEach(s => {
                if (s.Shift_Type__c === 'Time Off') return;
                const dur = new Date(s.EndTime) - new Date(s.StartTime);
                s.Scheduling_Status__c === 'Draft' ? (draftMs += dur) : (confirmedMs += dur);
            });

            let rowMaxLevel = 0;

            const daysMap = this.dateHeaders.map(header => {
                const isPast    = header.dateValue < todayStr;
                const cellKey   = `${contact.Id}-${header.dateValue}-${header.hourValue}`;
                const showGhost = this.activeGhostId === cellKey;

                const cellStartMs = new Date(header.dateValue + 'T00:00:00').getTime();
                const cellEndMs   = new Date(header.dateValue + 'T23:59:59').getTime();

                let shiftsForCell = myShifts.filter(s => {
                    const sStart = new Date(s.StartTime).getTime();
                    const sEnd   = new Date(s.EndTime).getTime();
                    return sStart <= cellEndMs && sEnd >= cellStartMs;
                });

                shiftsForCell = shiftsForCell.map(s => {
                    const sStart = new Date(s.StartTime).getTime();
                    const sEnd   = new Date(s.EndTime).getTime();
                    return {
                        ...s,
                        _boundedStart: new Date(Math.max(sStart, cellStartMs)),
                        _boundedEnd:   new Date(Math.min(sEnd, cellEndMs)),
                        _durMs:        Math.min(sEnd, cellEndMs) - Math.max(sStart, cellStartMs),
                        isSpillLeft:   sStart < cellStartMs,
                        isSpillRight:  sEnd   > cellEndMs
                    };
                }).filter(s => !isDailyView || s._boundedStart.getHours() === header.hourValue);

                const cellTotalMs = shiftsForCell.reduce((acc, s) => acc + s._durMs, 0);
                let heatClass = '';
                if (this.isHeatMapMode && cellTotalMs > 0) {
                    const hrs = cellTotalMs / 3600000;
                    if (hrs <= 5) heatClass = 'heat-low';
                    else if (hrs <= 8) heatClass = 'heat-optimal';
                    else heatClass = 'heat-critical';
                }

                shiftsForCell.sort((a, b) => a._boundedStart - b._boundedStart);
                shiftsForCell.forEach((s1, idx) => {
                    s1._level = 0;
                    for (let i = 0; i < idx; i++) {
                        const s2 = shiftsForCell[i];
                        if (Math.max(+s1._boundedStart, +s2._boundedStart) < Math.min(+s1._boundedEnd, +s2._boundedEnd)
                            && s1._level <= s2._level) {
                            s1._level = s2._level + 1;
                        }
                    }
                    if (s1._level > rowMaxLevel) rowMaxLevel = s1._level;
                });

                const mappedShifts = shiftsForCell.map(s => {
                    const statusLower = s.Scheduling_Status__c?.toLowerCase() || 'pending';
                    const typeClass = this._typeClassMap[s.Shift_Type__c] || 'shift-general';

                    let css = `shift-box border-${statusLower} ${typeClass}`;
                    if (s.isSpillLeft)  css += ' spill-left';
                    if (s.isSpillRight) css += ' spill-right';

                    const isEditable = !isPast;
                    if (isPast) css += ' readonly-shift';
                    if (this.inlineEditShiftId === s.Id) css += ' is-editing';

                    const isCutPending = this.isCutAction && this.cutShiftId === s.Id;
                    if (isCutPending) css += ' cut-pending';

                    if (this.selectedShiftIds.includes(s.Id)) css += ' selected-shift';

                    const hasConflict = !isMonthly && this._hasConflict(s, myShifts);
                    if (hasConflict) css += ' overlap-warning';

                    let pillClass = 'status-pill pill-pending';
                    if (s.Scheduling_Status__c === 'Confirmed') pillClass = 'status-pill pill-confirmed';
                    else if (s.Scheduling_Status__c === 'Published') pillClass = 'status-pill pill-active';

                    const statusShortMap = { Confirmed: 'C', Published: 'P', Draft: 'D' };
                    const statusShort    = statusShortMap[s.Scheduling_Status__c] || (s.Scheduling_Status__c?.charAt(0) || '');

                    let dynamicStyle = '';
                    if (isDailyView && !this.isHeatMapMode) {
                        const sMin    = s._boundedStart.getMinutes();
                        const durH    = s._durMs / 3600000;
                        const snapped = Math.max(60, Math.round((durH * 120) / 60) * 60);
                        dynamicStyle  = `width:${snapped - 4}px;left:${(sMin/60)*120}px;top:${4 + s._level * 60}px;position:absolute;z-index:${2 + s._level};`;
                    }

                    const fmt      = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const fullDesc = s.Label || s.Shift_Type__c || '';

                    const btnCutClass    = isEditable ? 'action-btn btn-cut'    : 'btn-disabled';
                    const btnDeleteClass = isEditable ? 'action-btn btn-delete' : 'btn-disabled';
                    const showResize = isDailyView && isEditable;

                    return {
                        ...s,
                        id:            s.Id,
                        description:   fullDesc,
                        shortDesc:     this._shortDesc(fullDesc),
                        timeRange:     `${fmt(s.StartTime)} - ${fmt(s.EndTime)}`,
                        displayDate:   new Date(s.Shift_Date__c + 'T00:00:00').toLocaleDateString(),
                        cssClass:      css,
                        dynamicStyle,
                        pillClass,
                        statusShort,
                        isDaily:       isDailyView,
                        showResize:    showResize,
                        isEditable,            
                        isLocked:      isPast,
                        isCutPending,
                        isSelected:    this.selectedShiftIds.includes(s.Id),
                        locationName:  lMap.get(s.Location__c) || '',
                        contactName:   cMap.get(s.Contact__c)?.Name || '',
                        shiftType:     s.Shift_Type__c || '',
                        btnCutClass,           
                        btnDeleteClass,
                        hasConflict         
                    };
                });

                const dropZoneClass = isDailyView
                    ? (isPast ? 'drop-zone daily-drop-zone drop-zone-past' : 'drop-zone daily-drop-zone')
                    : isMonthly
                        ? (isPast ? 'drop-zone monthly-drop-zone drop-zone-past' : 'drop-zone monthly-drop-zone')
                        : (isPast ? 'drop-zone drop-zone-past' : 'drop-zone');

                return {
                    columnId: header.columnId, dateValue: header.dateValue, hourValue: header.hourValue,
                    shifts: mappedShifts, dropZoneClass, isMonthly,
                    shiftCount: shiftsForCell.length, hasShifts: shiftsForCell.length > 0,
                    moreThanOne: shiftsForCell.length > 1,
                    cellHrsDisplay: cellTotalMs > 0 ? (cellTotalMs / 3600000).toFixed(1) : '',
                    showGhost, heatClass
                };
            });

            const totalH = ((confirmedMs + draftMs) / 3600000).toFixed(1);
            let bdg = totalH >= 40 ? 'badge-hours slds-theme_error' : 'badge-hours slds-theme_success';

            const parts   = contact.Name ? contact.Name.split(' ') : ['U'];
            const initials = (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();

            grouped[groupName].contacts.push({
                contactId: contact.Id, contactName: contact.Name, initials,
                days: daysMap, totalHours: totalH,
                confirmedHrs: (confirmedMs / 3600000).toFixed(1),
                draftHrs:     (draftMs     / 3600000).toFixed(1),
                hasDraft: draftMs > 0, badgeClass: bdg,
                rowHeightStyle: (isDailyView && !this.isHeatMapMode) ? `min-height:${80 + rowMaxLevel * 60}px;` : ''
            });
        });

        this.gridData = Object.values(grouped).sort((a, b) => a.groupName.localeCompare(b.groupName));
    }

    handleShiftMouseEnter(event) {
        const shiftId = event.currentTarget.dataset.id;
        if (!shiftId) return;
        this._hoverShiftId = shiftId;
        if (this._hoverTimeout) { clearTimeout(this._hoverTimeout); this._hoverTimeout = null; }
        const rect = event.currentTarget.getBoundingClientRect();

        this._hoverTimeout = setTimeout(() => {
            if (this._hoverShiftId !== shiftId) return;
            const s = this.allShifts.find(sh => sh.Id === shiftId);
            if (!s) return;

            const lMap  = new Map(this.locationOptions.map(l => [l.value, l.label]));
            const cMap  = new Map(this.allContacts.map(c => [c.Id, c]));
            const fmt   = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const fmtD  = new Date(s.Shift_Date__c + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

            const cardW = 280, cardH = 230;
            const vpW = window.innerWidth, vpH = window.innerHeight;
            let left = rect.right + 12, top = rect.top;
            if (left + cardW > vpW - 8) left = rect.left - cardW - 12;
            if (left < 8) left = 8;
            if (top + cardH > vpH - 8) top = vpH - cardH - 8;
            if (top < 8) top = 8;

            const myShifts   = this.allShifts.filter(x => x.Contact__c === s.Contact__c);
            const hasConflict = this._hasConflict(s, myShifts);

            const hdrMap = {
                Confirmed: 'background:linear-gradient(135deg,#2E844A,#1a5c2a);color:#fff;padding:10px 12px;',
                Published: 'background:linear-gradient(135deg,#0176D3,#014486);color:#fff;padding:10px 12px;',
                Draft:     'background:linear-gradient(135deg,#706E6B,#4a4a4a);color:#fff;padding:10px 12px;'
            };

            let pillClass = 'status-pill pill-pending';
            if (s.Scheduling_Status__c === 'Confirmed') pillClass = 'status-pill pill-confirmed';
            else if (s.Scheduling_Status__c === 'Published') pillClass = 'status-pill pill-active';

            this.hoverCard = {
                visible: true,
                style:   `left:${left}px;top:${top}px;`,
                description:  s.Label || s.Shift_Type__c || 'Shift',
                timeRange:    `${fmt(s.StartTime)} – ${fmt(s.EndTime)}`,
                displayDate:  fmtD,
                locationName: lMap.get(s.Location__c) || '',
                shiftType:    s.Shift_Type__c || '—',
                contactName:  cMap.get(s.Contact__c)?.Name || 'Unknown',
                status:       s.Scheduling_Status__c || 'Draft',
                pillClass,
                hasConflict,
                headerStyle:  hdrMap[s.Scheduling_Status__c] || hdrMap.Draft
            };
        }, 850);
    }

    handleShiftMouseLeave() {
        this._hoverShiftId = null;
        if (this._hoverTimeout) { clearTimeout(this._hoverTimeout); this._hoverTimeout = null; }
        if (this.hoverCard.visible) this.hoverCard = { ...this.hoverCard, visible: false };
    }

    handleCardMouseDown(event) {
        if (event.target.closest('.resize-handle') || event.target.closest('.shift-action-bar')) return;
        const el = event.currentTarget;
        if (el.dataset.editable === 'true') {
            el.setAttribute('draggable', 'true');
            el.classList.add('is-dragging');

            const shiftId = el.dataset.shiftId;
            const s = this.allShifts.find(x => x.Id === shiftId);
            if (s && this.viewMode === 'Daily') {
                const cardRect = el.getBoundingClientRect();
                const pxIntoCard = event.clientX - cardRect.left;
                this._dragStartMinuteOffset = Math.max(0, Math.round(pxIntoCard / 2));
            } else {
                this._dragStartMinuteOffset = 0;
            }
            this._dragStartClientX = event.clientX;
        }
    }

    handleCardMouseUp(event) {
        event.currentTarget.removeAttribute('draggable');
        event.currentTarget.classList.remove('is-dragging');
    }

    handleDragEnd(event) {
        event.currentTarget.removeAttribute('draggable');
        event.currentTarget.classList.remove('is-dragging');
    }

    handleBtnCut(event) {
        event.stopPropagation();
        const shiftId = event.currentTarget.dataset.id;
        if (!shiftId) return;
        const s = this.allShifts.find(x => x.Id === shiftId);
        if (!s) return;
        if (s.Shift_Date__c < new Date().toISOString().split('T')[0]) {
            this.showToast('Read Only', 'Cannot cut past shifts.', 'info'); return;
        }
        this._doCut(shiftId);
    }

    handleBtnCopy(event) {
        event.stopPropagation();
        const shiftId = event.currentTarget.dataset.id;
        if (shiftId) this._doCopy(shiftId);
    }

    handleBtnDelete(event) {
        event.stopPropagation();
        const shiftId = event.currentTarget.dataset.id;
        if (!shiftId) return;
        const s = this.allShifts.find(x => x.Id === shiftId);
        if (!s) return;
        if (s.Shift_Date__c < new Date().toISOString().split('T')[0]) {
            this.showToast('Read Only', 'Cannot delete past shifts.', 'info'); return;
        }
        this._doDelete(shiftId);
    }

    _doCopy(shiftId) {
        const s = this.allShifts.find(x => x.Id === shiftId);
        if (!s) return;
        this.copiedShift = { ...s };
        this.isCutAction = false;
        this.cutShiftId  = null;
        this.buildGrid();
        this.showToast('Copied', 'Shift copied. Click a paste icon on any cell to duplicate.', 'info');
    }

    _doCut(shiftId) {
        const s = this.allShifts.find(x => x.Id === shiftId);
        if (!s) return;
        this.copiedShift = { ...s };
        this.isCutAction = true;
        this.cutShiftId  = shiftId;
        this.buildGrid();
        this.showToast('Cut', 'Shift ready to move. Click a paste icon on destination cell.', 'info');
    }

    _doDelete(shiftId) {
        if (!shiftId) return;
        this.pendingDeleteId     = shiftId;
        this.isDeleteConfirmOpen = true;
    }

    clearClipboard() {
        this.copiedShift = null; this.isCutAction = false; this.cutShiftId  = null; this.buildGrid();
    }

    // Handles pasting operations utilizing absolute epoch milliseconds for timezone reliability
    handlePaste(event) {
        event.stopPropagation();
        if (!this.copiedShift) return;

        const targetDate    = event.currentTarget.dataset.date;
        const targetContact = event.currentTarget.dataset.contact;
        const targetHour    = event.currentTarget.dataset.hour;
        const todayStr      = new Date().toISOString().split('T')[0];

        if (targetDate < todayStr) {
            this.showToast('Blocked', 'Cannot paste shifts into the past.', 'error'); return;
        }

        const orig   = this.copiedShift;
        const oStart = new Date(orig.StartTime);
        const oEnd   = new Date(orig.EndTime);
        const durMs  = oEnd.getTime() - oStart.getTime();
        
        let sH = oStart.getHours(), sM = oStart.getMinutes();
        if (targetHour && targetHour !== 'null') {
            sH = parseInt(targetHour, 10);
            sM = 0; 
        }

        const [y, m, d] = targetDate.split('-');
        const newStartMs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), sH, sM, 0, 0).getTime();
        const newEndMs  = newStartMs + durMs;

        const wasCut   = this.isCutAction;
        const cutId    = orig.Id;
        const cutCon   = orig.Contact__c;
        const cutDate  = orig.Shift_Date__c;
        const cutStart = orig.StartTime;

        this.copiedShift = null; this.isCutAction = false; this.cutShiftId = null;
        this.buildGrid();

        if (wasCut) {
            updateShiftAssignment({ shiftId: cutId, newContactId: targetContact, newDate: targetDate, newStartMs: newStartMs })
            .then(() => {
                this.pushToUndoStack('UPDATE', { Id: cutId, Contact__c: cutCon, Shift_Date__c: cutDate, StartTime: cutStart });
                this.showToast('Moved', 'Shift moved successfully!', 'success');
                return refreshApex(this.wiredResult);
            })
            .catch(err => {
                console.error('Paste Move Error:', JSON.parse(JSON.stringify(err)));
                this.showToast('Error', err.body?.message || 'Move failed.', 'error');
            });
        } else {
            createOrUpdateShift({
                contactId: targetContact, shiftDate: targetDate,
                shiftType: orig.Shift_Type__c, status: orig.Scheduling_Status__c,
                locationId: orig.Location__c || null, startMs: newStartMs, endMs: newEndMs,
                description: orig.Label, existingId: null
            })
            .then(() => { this.showToast('Pasted', 'Shift duplicated!', 'success'); return refreshApex(this.wiredResult); })
            .catch(err => {
                console.error('Paste Duplicate Error:', JSON.parse(JSON.stringify(err)));
                this.showToast('Error', err.body?.message || 'Paste failed.', 'error');
            });
        }
    }

    cancelDelete() { this.isDeleteConfirmOpen = false; this.pendingDeleteId = null; }

    confirmDelete() {
        this.isDeleteConfirmOpen = false;
        const id = this.pendingDeleteId;
        this.pendingDeleteId = null;
        if (!id) return;
        deleteShift({ shiftId: id })
        .then(() => { this.showToast('Deleted', 'Shift removed successfully.', 'success'); return refreshApex(this.wiredResult); })
        .catch(err => this.showToast('Error', err.body?.message || 'Delete failed.', 'error'));
    }

    pushToUndoStack(type, record) {
        this.actionHistory  = [...this.actionHistory, { type, record: { ...record } }];
        this.isUndoDisabled = false;
    }

    handleUndo() {
        if (!this.actionHistory.length) return;
        const history = [...this.actionHistory];
        const last    = history.pop();
        this.actionHistory  = history;
        this.isUndoDisabled = history.length === 0;
        if (last.type === 'UPDATE') {
            const r = last.record;
            const oldStartMs = r.StartTime ? new Date(r.StartTime).getTime() : null;
            
            updateShiftAssignment({ shiftId: r.Id, newContactId: r.Contact__c, newDate: r.Shift_Date__c, newStartMs: oldStartMs })
            .then(() => { this.showToast('Undone', 'Shift reverted.', 'success'); return refreshApex(this.wiredResult); })
            .catch(err => {
                this.showToast('Undo Failed', err.body?.message || 'Could not undo.', 'error');
                this.actionHistory  = [...this.actionHistory, last];
                this.isUndoDisabled = false;
            });
        }
    }

    handleShiftSelection(event) {
        event.stopPropagation();
        const id = event.target.dataset.id;
        this.selectedShiftIds = event.target.checked
            ? [...this.selectedShiftIds, id]
            : this.selectedShiftIds.filter(x => x !== id);
        this.buildGrid();
    }
    clearSelection() { this.selectedShiftIds = []; this.buildGrid(); }
    openBulkModal()  { this.bulkStatus = ''; this.bulkType = ''; this.bulkLocationId = null; this.isBulkModalOpen = true; }
    closeBulkModal() { this.isBulkModalOpen = false; }
    saveBulkEdit() {
        bulkUpdateShifts({ shiftIds: this.selectedShiftIds, status: this.bulkStatus, locationId: this.bulkLocationId, shiftType: this.bulkType })
        .then(() => {
            this.showToast('Success', `${this.selectedShiftsCount} shifts updated.`, 'success');
            this.isBulkModalOpen = false; this.clearSelection();
            return refreshApex(this.wiredResult);
        })
        .catch(err => this.showToast('Error', err.body?.message || 'Bulk update failed.', 'error'));
    }
    // 👇 PASTE THIS NEW FUNCTION RIGHT HERE 👇
    handlePublishView() {
        // 1. Figure out exactly what dates the Admin is currently looking at
        const visibleDates = this.dateHeaders.map(h => h.dateValue);
        if (visibleDates.length === 0) return;

        const startStr = visibleDates[0];
        const endStr = visibleDates[visibleDates.length - 1];

        // 2. Filter all shifts in memory to find only the Drafts inside this date range
        const draftIds = this.allShifts
            .filter(s => 
                s.Scheduling_Status__c === 'Draft' && 
                s.Shift_Date__c >= startStr && 
                s.Shift_Date__c <= endStr
            )
            .map(s => s.Id);

        // 3. If there are no drafts, tell the user
        if (draftIds.length === 0) {
            this.showToast('All Caught Up!', 'There are no draft shifts in the current view to publish.', 'info');
            return;
        }

        // 4. Send those IDs to our existing bulk update Apex method!
        bulkUpdateShifts({ 
            shiftIds: draftIds, 
            status: 'Published', 
            locationId: null, 
            shiftType: '' 
        })
        .then(() => {
            this.showToast('Success', `Successfully published ${draftIds.length} shifts!`, 'success');
            return refreshApex(this.wiredResult);
        })
        .catch(err => {
            console.error('Publish Error:', err);
            this.showToast('Error', err.body?.message || 'Failed to publish shifts.', 'error');
        });
    }

    handleResizeStart(event) {
        event.stopPropagation(); event.preventDefault();
        if (event.target.dataset.editable === 'false') return;
        this._isResizing       = true;
        this._resizeStartX     = event.clientX;
        this._resizingShiftId  = event.target.dataset.id;
        this._resizingEl       = event.target.closest('.shift-box');
        this._resizeStartWidth = this._resizingEl.offsetWidth;
        window.addEventListener('mousemove', this._onResizeMove);
        window.addEventListener('mouseup',   this._onResizeEnd);
    }

    _onResizeMove = (event) => {
        if (!this._isResizing) return;
        event.preventDefault();
        const dx      = event.clientX - this._resizeStartX;
        const snapped = Math.max(60, Math.round((this._resizeStartWidth + dx) / 60) * 60);
        this._resizingEl.style.width = `${snapped}px`;
        const added  = ((snapped - this._resizeStartWidth) / 120) * 60;
        const s      = this.allShifts.find(x => x.Id === this._resizingShiftId);
        if (s) {
            const newEnd = new Date(+new Date(s.EndTime) + added * 60000);
            this.resizeTooltip = {
                visible: true,
                text:    `End: ${newEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                style:   `left:${event.clientX + 20}px;top:${event.clientY}px;`
            };
        }
    };

    _onResizeEnd = () => {
        if (!this._isResizing) return;
        this._isResizing   = false;
        this.resizeTooltip = { visible: false, text: '', style: '' };
        window.removeEventListener('mousemove', this._onResizeMove);
        window.removeEventListener('mouseup',   this._onResizeEnd);
        const finalW = parseInt(this._resizingEl.style.width, 10);
        const delta  = Math.round(((finalW - this._resizeStartWidth) / 120) * 60);
        if (delta === 0) { this.buildGrid(); return; }
        resizeShiftDuration({ shiftId: this._resizingShiftId, addedMinutes: delta })
        .then(() => { this.showToast('Updated', 'Shift duration adjusted.', 'success'); return refreshApex(this.wiredResult); })
        .catch(err => { this.showToast('Error', err.body?.message, 'error'); this.buildGrid(); });
    };

    handleDragStart(event) {
        if (event.target.classList.contains('resize-handle')) { event.preventDefault(); return; }
        if (event.currentTarget.dataset.editable !== 'true') { event.preventDefault(); return; }
        const shiftId = event.currentTarget.dataset.shiftId;
        const snap    = this.allShifts.find(s => s.Id === shiftId);
        if (snap) this.pushToUndoStack('UPDATE', { Id: snap.Id, Contact__c: snap.Contact__c, Shift_Date__c: snap.Shift_Date__c, StartTime: snap.StartTime });
        event.dataTransfer.setData('text/plain', shiftId);
    }

    handleDragOver(event) {
        const date = event.currentTarget.dataset.date;
        if (date && date < new Date().toISOString().split('T')[0]) return;
        event.preventDefault();
    }

    // Advanced 15-Minute Grid Snapping Mechanism
    handleDrop(event) {
        event.preventDefault();
        const id      = event.dataTransfer.getData('text/plain');
        const date    = event.currentTarget.dataset.date;
        const contact = event.currentTarget.dataset.contact;
        const hourStr = event.currentTarget.dataset.hour;
        const today   = new Date().toISOString().split('T')[0];

        if (date < today) {
            this.showToast('Blocked', 'Cannot schedule shifts in the past.', 'error');
            const h = [...this.actionHistory]; h.pop();
            this.actionHistory = h; this.isUndoDisabled = h.length === 0; return;
        }

        const orig = this.allShifts.find(x => x.Id === id);
        const oldStart = new Date(orig.StartTime);
        let newHour = (hourStr !== 'null' && hourStr !== undefined && hourStr !== '') ? parseInt(hourStr, 10) : null;
        let newStartMs = null;

        if (this.viewMode === 'Daily' && newHour !== null) {
            const dropZoneEl  = event.currentTarget;
            const cellRect    = dropZoneEl.getBoundingClientRect();
            const pxIntoCell  = event.clientX - cellRect.left;
            
            let rawMinute = Math.round(pxIntoCell / 2) - this._dragStartMinuteOffset;
            let snappedMinute = Math.round(rawMinute / 15) * 15; // Clean 15-minute grid lock

            if (snappedMinute < 0) {
                snappedMinute = 0;
            } else if (snappedMinute >= 60) {
                newHour = Math.min(23, newHour + 1);
                snappedMinute = 0;
            }

            const [y, m, d] = date.split('-');
            newStartMs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), newHour, snappedMinute, 0, 0).getTime();
            
        } else if (newHour !== null) {
            const [y, m, d] = date.split('-');
            newStartMs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), newHour, 0, 0, 0).getTime();
        } else {
            const [y, m, d] = date.split('-');
            newStartMs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), oldStart.getHours(), oldStart.getMinutes(), 0, 0).getTime();
        }

        updateShiftAssignment({ shiftId: id, newContactId: contact, newDate: date, newStartMs: newStartMs })
        .then(() => refreshApex(this.wiredResult))
        .catch(err => {
            console.error('Drag Drop Error:', JSON.parse(JSON.stringify(err)));
            this.showToast('Error', err.body?.message, 'error');
            const h = [...this.actionHistory]; h.pop();
            this.actionHistory = h; this.isUndoDisabled = h.length === 0;
            return refreshApex(this.wiredResult);
        });
    }

    handleCardClick(event) {
        if (event.target.closest('.shift-action-bar') || event.target.classList.contains('resize-handle')) return;

        const shiftId = event.currentTarget.dataset.shiftId;
        const s = this.allShifts.find(x => x.Id === shiftId);
        if (!s) return;

        const today = new Date().toISOString().split('T')[0];
        if (s.Shift_Date__c < today) {
            this.showToast('Read Only', 'Past shifts cannot be modified.', 'info'); return;
        }
        this.selectedShiftId    = s.Id;
        this.selectedDate       = s.Shift_Date__c;
        this.selectedContactId  = s.Contact__c;
        this.shiftDescription   = s.Label;
        this.selectedType       = s.Shift_Type__c;
        this.selectedStatus     = s.Scheduling_Status__c || 'Draft';
        this.selectedLocationId = s.Location__c;
        this.startTime          = this._formatTimeForInput(new Date(s.StartTime));
        this.endTime            = this._formatTimeForInput(new Date(s.EndTime));
        // 👇 ADD THESE LINES 👇
        this.isRecurring       = s.Is_Recurring__c || false;
        this.recurrencePattern = s.Recurrence_Pattern__c || 'Weekly';
        // We don't load the end date on edit to prevent accidental mass-recreation
        this.recurrenceEndDate = null;
        this.isModalOpen        = true;
    }

    // Instant Single-Click modal generation for optimal usability on weekly grids
    handleZoneClick(event) {
        if (event.target.closest('.shift-box') || event.target.closest('.paste-overlay') || event.target.closest('lightning-button-icon')) return;
        if (this.viewMode === 'Daily' || this.viewMode === 'Monthly') return; 

        const date  = event.currentTarget.dataset.date;
        const today = new Date().toISOString().split('T')[0];
        
        if (date < today) { 
            this.showToast('Read Only', 'Cannot create shifts in the past.', 'info'); 
            return; 
        }

        this.selectedShiftId    = null;
        
        // 👇 ADD THESE 3 LINES 👇
        this.isRecurring        = false;
        this.customDays.forEach(d => d.cssClass = 'day-pill');
        this.selectedDays = [];
        this.recurrencePattern  = 'Weekly';
        this.recurrenceEndDate  = null;
        this.shiftDescription   = '';
        this.selectedType       = 'Regular';
        this.selectedStatus     = 'Draft';
        this.selectedLocationId = null;
        this.selectedDate       = date;
        this.selectedContactId  = event.currentTarget.dataset.contact;
        this.startTime = '09:00:00.000'; 
        this.endTime   = '17:00:00.000';
        this.isModalOpen = true;
    }

    handleCreateDragStart(event) {
        if (event.target.closest('.shift-box') || event.target.closest('lightning-button-icon')) return;
        if (this.viewMode !== 'Daily') return; 

        const date  = event.currentTarget.dataset.date;
        const today = new Date().toISOString().split('T')[0];
        if (date && date < today) return;
        event.preventDefault();
        
        this._isDrawing     = true;
        this._drawStartX    = event.clientX;
        this._drawStartCell = event.currentTarget;
        const cid = event.currentTarget.dataset.contact;
        const dv  = event.currentTarget.dataset.date;
        const hv  = event.currentTarget.dataset.hour;
        
        this.activeGhostId = `${cid}-${dv}-${hv}`;
        this.ghostStyle    = 'width:60px;left:0px;';
        this.buildGrid();
        window.addEventListener('mousemove', this._onDrawMove);
        window.addEventListener('mouseup',   this._onDrawEnd);
    }

    _onDrawMove = (e) => {
        if (!this._isDrawing) return;
        const dx = e.clientX - this._drawStartX;
        const w  = Math.max(60, Math.round(dx / 60) * 60);
        this.ghostStyle = `width:${w}px;left:0px;`;
    };

    _onDrawEnd = () => {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        window.removeEventListener('mousemove', this._onDrawMove);
        window.removeEventListener('mouseup',   this._onDrawEnd);
        
        const finalW  = parseInt(this.ghostStyle.split('width:')[1], 10);
        const durMins = (finalW / 120) * 60;
        
        const rawH = this._drawStartCell.dataset.hour;
        const h = (rawH !== 'null' && rawH !== undefined) ? parseInt(rawH, 10) : 9;
        
        this.selectedDate      = this._drawStartCell.dataset.date;
        this.selectedContactId = this._drawStartCell.dataset.contact;
        this.selectedShiftId   = null;
        this.shiftDescription  = '';
        
        // Reset Recurrence & Pills
        this.isRecurring = false;
        this.recurrencePattern = 'Weekly';
        this.recurrenceEndDate = null;
        this.customDays.forEach(d => d.cssClass = 'day-pill');
        this.selectedDays = [];
        
        const sD = new Date(); sD.setHours(h, 0, 0, 0);
        const eD = new Date(sD.getTime() + durMins * 60000);
        
        this.startTime = this._formatTimeForInput(sD);
        this.endTime   = this._formatTimeForInput(eD);
        
        this.activeGhostId = null;
        this.buildGrid();
        this.isModalOpen = true;
    };

    openMonthlyDashboard(event) {
        event.stopPropagation();
        const contactId = event.currentTarget.dataset.contact;
        const dateValue = event.currentTarget.dataset.date;
        const contact   = this.allContacts.find(c => c.Id === contactId);

        const dayShifts = this.allShifts
            .filter(s => s.Contact__c === contactId && s.Shift_Date__c === dateValue)
            .map(s => {
                const fmt = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return {
                    ...s,
                    displayTime: `${fmt(s.StartTime)} - ${fmt(s.EndTime)}`,
                    isNight:     s.Shift_Type__c === 'Night',
                    typeTheme:   s.Shift_Type__c === 'Night' ? 'slds-badge slds-theme_inverse' : 'slds-badge'
                };
            });

        this.dashboardData = {
            dateStr:     new Date(dateValue + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            contactName: contact?.Name || '',
            shifts:      dayShifts
        };
        this.isDashboardOpen = true;
    }

    closeDashboard() { this.isDashboardOpen = false; }

    handleInlineEditStart(event) {
        event.stopPropagation();
        if (event.currentTarget.dataset.editable === 'false') return;
        this.inlineEditShiftId = event.currentTarget.dataset.id;
        this.hoverCard = { ...this.hoverCard, visible: false };
        this.buildGrid();
        setTimeout(() => {
            const inputEl = this.template.querySelector(`input.inline-edit-input[data-id="${this.inlineEditShiftId}"]`);
            if (inputEl) { inputEl.focus(); inputEl.select(); }
        }, 50);
    }

    handleInlineEditBlur(event) { this.saveInlineEdit(event.target.dataset.id, event.target.value); }
    handleInlineEditKey(event)  { if (event.key === 'Enter') event.target.blur(); else if (event.key === 'Escape') { this.inlineEditShiftId = null; this.buildGrid(); } }

    saveInlineEdit(shiftId, newLabel) {
        if (!shiftId) return;
        this.inlineEditShiftId = null;
        const shift    = this.allShifts.find(s => s.Id === shiftId);
        const oldLabel = shift?.Label || shift?.Shift_Type__c || '';
        if (!shift || oldLabel === newLabel) { this.buildGrid(); return; }
        this.pushToUndoStack('UPDATE', { ...shift });
        updateShiftLabel({ shiftId, newLabel })
        .then(() => { this.showToast('Success', 'Shift renamed.', 'success'); return refreshApex(this.wiredResult); })
        .catch(err => { this.showToast('Error', err.body?.message || 'Rename failed', 'error'); this.buildGrid(); });
    }

    handleInputChange(e) { this[e.target.name] = e.target.value; }
    // Toggles use 'checked' instead of 'value'
    handleToggleChange(event) { this[event.target.name] = event.target.checked; }
    handleDayClick(event) {
        const clickedVal = event.currentTarget.dataset.val;
        
        // Toggle the selected state and update CSS class
        this.customDays = this.customDays.map(day => {
            if (day.value === clickedVal) {
                const isSelected = !day.cssClass.includes('day-selected');
                day.cssClass = isSelected ? 'day-pill day-selected' : 'day-pill';
            }
            return day;
        });

        // Update the array that gets sent to Apex
        this.selectedDays = this.customDays
            .filter(d => d.cssClass.includes('day-selected'))
            .map(d => d.value);
    }

    // Ensures timezone boundaries are bypassed entirely by stripping metadata and passing absolute milliseconds
    saveShift() {
        try {
            // Validate Recurrence
            if (this.isRecurring) {
                if (!this.recurrenceEndDate) {
                    this.showToast('Missing Information', 'Please select an End Date for the repeating schedule.', 'warning');
                    return; 
                }
                if (this.recurrenceEndDate < this.selectedDate) {
                    this.showToast('Invalid Date', 'End Date cannot be before the Start Date.', 'error');
                    return; 
                }
                if (this.isCustomPattern && (!this.selectedDays || this.selectedDays.length === 0)) {
                    this.showToast('Missing Information', 'Please select at least one day of the week.', 'warning');
                    return; 
                }
            }

            const [year, month, day] = this.selectedDate.split('-').map(Number);
            const [hours, minutes] = this.startTime.split(':').map(Number);
            const [endHours, endMinutes] = this.endTime.split(':').map(Number);

            const sDt = new Date(year, month - 1, day, hours, minutes, 0, 0);
            const eDt = new Date(year, month - 1, day, endHours, endMinutes, 0, 0);
            if (eDt <= sDt) { eDt.setDate(eDt.getDate() + 1); }

            // Safely bypass LWC Array Proxy issues to create the string "Mon,Tue"
            let finalSelectedDays = null;
            if (this.isRecurring && this.isCustomPattern && this.selectedDays) {
                // Ensure we get a flat comma-separated string
                finalSelectedDays = JSON.parse(JSON.stringify(this.selectedDays)).join(',');
            }

            createOrUpdateShift({
                contactId: this.selectedContactId, 
                shiftDate: this.selectedDate,
                shiftType: this.selectedType, 
                status: this.selectedStatus,
                locationId: this.selectedLocationId || null, 
                startMs: sDt.getTime(), 
                endMs: eDt.getTime(),   
                description: this.shiftDescription, 
                existingId: this.selectedShiftId,
                isRecurring: this.isRecurring,
                recurrencePattern: this.isRecurring ? this.recurrencePattern : null,
                recurrenceEndDate: this.isRecurring ? this.recurrenceEndDate : null,
                selectedDays: finalSelectedDays
            })
            .then(() => { 
                this.showToast('Success', 'Record(s) Saved Successfully!', 'success'); 
                this.isModalOpen = false; 
                return refreshApex(this.wiredResult); 
            })
            .catch(error => {
                console.error('Apex Save Error Details:', JSON.parse(JSON.stringify(error)));
                // Provide exact Apex reason directly to user
                this.showToast('Save Blocked', error.body?.message || 'Failed to save shift.', 'error');
            });
        } catch (jsError) {
            console.error('JavaScript Processing Error:', jsError);
        }
    }

    closeModal() { this.isModalOpen = false; }

    get agendaData() {
        if (!this.allShifts || this.allShifts.length === 0) return [];

        const cMap = new Map(this.allContacts.map(c => [c.Id, c]));
        const lMap = new Map(this.locationOptions.map(l => [l.value, l.label]));
        
        const groupedByDate = this.allShifts.reduce((acc, shift) => {
            const dateKey = shift.Shift_Date__c;
            if (!acc[dateKey]) acc[dateKey] = [];
            
            const contact = cMap.get(shift.Contact__c) || {};
            const stDate = new Date(shift.StartTime);
            const etDate = new Date(shift.EndTime);

            const timeStr = (!isNaN(stDate) && !isNaN(etDate)) 
                ? `${stDate.getHours().toString().padStart(2,'0')}:${stDate.getMinutes().toString().padStart(2,'0')} - ${etDate.getHours().toString().padStart(2,'0')}:${etDate.getMinutes().toString().padStart(2,'0')}`
                : 'Time TBD';

            acc[dateKey].push({
                ...shift,
                contactName: contact.Name || 'Unassigned',
                department: contact.Department__c || '—',
                locationName: lMap.get(shift.Location__c) || 'General',
                timeRange: timeStr
            });
            return acc;
        }, {});

        let result = Object.keys(groupedByDate)
            .sort() 
            .map(dateKey => {
                const dObj = new Date(dateKey + 'T00:00:00');
                const formattedDate = !isNaN(dObj) 
                    ? dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                    : dateKey;

                return {
                    date: dateKey,
                    displayDate: formattedDate,
                    shifts: groupedByDate[dateKey].sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime))
                };
            });

        const visibleDates = this.dateHeaders.map(h => h.dateValue);
        result = result.filter(group => visibleDates.includes(group.date));

        return result;
    }

    get hasAgendaData() {
        return this.agendaData && this.agendaData.length > 0;
    }

    showToast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
    stopPropagation(e) { e.stopPropagation(); }
    preventDrag(e)     { e.preventDefault(); e.stopPropagation(); }
}