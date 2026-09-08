import { apiFetch } from '../api.js';
import { escapeHTML } from '../utils.js';
import { openTodoDialog } from '../dialogs/todo.js';
import { navigate } from '../router.js';
const VIEW_KEY = 'aipm-lite.workspace-view';
const sprintCache = new Map();
const boundKey = Symbol('aipm-workbench-bound');
const contentBoundKey = Symbol('aipm-workbench-content-bound');
export function getWorkspaceView(slug) {
    try {
        const raw = localStorage.getItem(`${VIEW_KEY}:${slug || 'default'}`);
        if (raw === 'overview' || raw === 'requirements' || raw === 'schedule' || raw === 'board')
            return raw;
    }
    catch { /* ignore storage failures */ }
    return 'requirements';
}
export function setWorkspaceView(view, slug) {
    try {
        localStorage.setItem(`${VIEW_KEY}:${slug || 'default'}`, view);
    }
    catch { /* ignore */ }
}
export function getCachedSprints(slug) {
    return sprintCache.get(slug) || [];
}
export function hasCachedSprints(slug) {
    return sprintCache.has(slug);
}
export async function preloadWorkbenchSprints(slug) {
    if (sprintCache.has(slug))
        return sprintCache.get(slug);
    try {
        const response = await apiFetch(`/api/board/${slug}/sprints`);
        const sprints = Array.isArray(response?.sprints) ? response.sprints : [];
        sprintCache.set(slug, sprints);
        return sprints;
    }
    catch {
        sprintCache.set(slug, []);
        return [];
    }
}
export function buildWorkbenchSummary(board) {
    const todos = allTodos(board);
    const p = progress(todos);
    return {
        total: todos.length,
        done: p.done,
        points: p.points,
        unassigned: todos.filter((todo) => !todo.assigneeUserId).length,
    };
}
export function exposeWorkbenchState() {
    window.__aipmWorkbench = { getWorkspaceView, setWorkspaceView, getCachedSprints, hasCachedSprints };
}
function allTodos(board) {
    const result = [];
    for (const todos of Object.values(board.columns || {}))
        result.push(...(todos || []));
    const seen = new Set();
    return result.filter((todo) => {
        const key = todo.localId || todo.id;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function stageName(board, todo) {
    const key = todo.columnKey || todo.status || '';
    const column = (board.columnOrder || []).find((item) => item.key === key);
    const fallback = { backlog: '需求池', not_started: '待开始', doing: '开发中', in_progress: '开发中', testing: '测试中', done: '已完成' };
    return column?.name || fallback[key] || key || '未设置';
}
function stageColor(board, todo) {
    const key = todo.columnKey || todo.status || '';
    return (board.columnOrder || []).find((item) => item.key === key)?.color || '#7187ff';
}
function priority(board, todo) {
    const item = (board.priorityOrder || []).find((tier) => tier.key === todo.priorityKey);
    if (item)
        return { label: item.name, color: item.color || '#7187ff' };
    if (todo.priorityKey)
        return { label: todo.priorityKey, color: '#7187ff' };
    return { label: '未定级', color: '#9aa5b5' };
}
function memberName(members, id) {
    if (!id)
        return '未分配';
    return members.find((member) => member.userId === id)?.name || `用户 #${id}`;
}
function formatDate(value) {
    if (!value)
        return '—';
    const date = new Date(typeof value === 'number' && value < 10000000000 ? value * 1000 : value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
function formatDateTime(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
function progress(todos) {
    const doneTodos = todos.filter((todo) => String(todo.columnKey || todo.status).toLowerCase() === 'done');
    const done = doneTodos.length;
    const points = todos.reduce((sum, todo) => sum + (Number(todo.estimationPoints) || 0), 0);
    return { done, percent: todos.length ? Math.round(done * 100 / todos.length) : 0, points };
}
function metric(label, value, tone = '') {
    return `<div class="aipm-metric ${tone}"><div class="aipm-metric__label">${escapeHTML(label)}</div><div class="aipm-metric__value">${escapeHTML(String(value))}</div></div>`;
}
function renderNav(view) {
    const items = [
        ['overview', '项目总览', '⌂'],
        ['requirements', '需求池', '▤'],
        ['schedule', '迭代排期', '◷'],
        ['board', '开发看板', '▦'],
    ];
    return `<nav class="aipm-nav" aria-label="项目工作区导航">${items.map(([key, label, icon]) => `<button type="button" class="aipm-nav__item ${view === key ? 'is-active' : ''}" data-aipm-view="${key}"><span class="aipm-nav__icon">${icon}</span><span>${label}</span></button>`).join('')}</nav>`;
}
function renderProjectHeader(board, view) {
    const initials = (board.project.name || '项目').slice(0, 1).toUpperCase();
    return `<header class="aipm-projectbar"><div class="aipm-projectbar__identity"><div class="aipm-project-avatar">${escapeHTML(initials)}</div><div><div class="aipm-eyebrow">产品研发工作区</div><h1>${escapeHTML(board.project.name)}</h1></div></div><div class="aipm-projectbar__actions"><span class="aipm-sync-dot">本地数据已同步</span>${view !== 'board' ? '<button class="btn" id="aipmQuickCreate" type="button">＋ 新建需求</button>' : ''}</div></header>`;
}
function renderOverview(board, members, sprints) {
    const todos = allTodos(board);
    const p = progress(todos);
    const p0 = todos.filter((todo) => todo.priorityKey?.toLowerCase() === 'p0').length;
    const p1 = todos.filter((todo) => todo.priorityKey?.toLowerCase() === 'p1').length;
    const unassigned = todos.filter((todo) => !todo.assigneeUserId).length;
    const active = sprints.find((sprint) => String(sprint.state).toLowerCase() === 'active') || sprints.find((sprint) => !sprint.closedAt);
    const stages = (board.columnOrder || []).map((column) => ({ ...column, count: todos.filter((todo) => (todo.columnKey || todo.status) === column.key).length }));
    return `<section class="aipm-page-head"><div><div class="aipm-eyebrow">执行概览</div><h2>今天，团队要推进什么？</h2><p>把需求优先级、迭代承诺和开发流转放在同一个可操作的工作台里。</p></div><div class="aipm-page-head__hint">${active ? `当前迭代：<strong>${escapeHTML(active.name)}</strong>` : '还没有进行中的迭代'}</div></section>
    <div class="aipm-metrics">${metric('需求总数', todos.length, 'is-primary')}${metric('P0 / P1', `${p0} / ${p1}`, 'is-danger')}${metric('完成率', `${p.percent}%`, 'is-success')}${metric('计划点数', p.points, 'is-purple')}${metric('未分配', unassigned, 'is-warning')}</div>
    <div class="aipm-grid aipm-grid--overview"><section class="aipm-panel aipm-panel--large"><div class="aipm-panel__head"><div><h3>需求流转分布</h3><p>当前工作项在各阶段的分布。</p></div><span class="aipm-panel__badge">${todos.length} 项</span></div><div class="aipm-stage-bars">${stages.length ? stages.map((stage) => `<div class="aipm-stage-row"><span class="aipm-stage-row__label"><i style="background:${escapeHTML(stage.color || '#7187ff')}"></i>${escapeHTML(stage.name)}</span><div class="aipm-stage-row__track"><span style="width:${todos.length ? Math.round(stage.count * 100 / todos.length) : 0}%;background:${escapeHTML(stage.color || '#7187ff')}"></span></div><strong>${stage.count}</strong></div>`).join('') : '<div class="aipm-empty">暂无流程阶段</div>'}</div></section><section class="aipm-panel"><div class="aipm-panel__head"><div><h3>当前迭代</h3><p>承诺与完成情况。</p></div></div>${active ? `<div class="aipm-sprint-summary"><div class="aipm-sprint-summary__name">${escapeHTML(active.name)}</div><div class="aipm-sprint-summary__date">${formatDate(active.plannedStartAt)} — ${formatDate(active.plannedEndAt)}</div><div class="aipm-progress"><span style="width:${p.percent}%"></span></div><div class="aipm-sprint-summary__foot"><span>${p.done} / ${todos.length} 已完成</span><strong>${p.percent}%</strong></div></div>` : '<div class="aipm-empty">在设置中创建第一个迭代</div>'}</section></div>
    <section class="aipm-panel"><div class="aipm-panel__head"><div><h3>需要关注</h3><p>优先处理未分配、未定级或大工作量需求。</p></div><span class="aipm-panel__badge">行动提示</span></div><div class="aipm-attention-list">${todos.filter((todo) => !todo.assigneeUserId || !todo.priorityKey || Number(todo.estimationPoints) >= 13).slice(0, 6).map((todo) => `<button class="aipm-attention" type="button" data-aipm-todo="${todo.localId}"><span class="aipm-attention__type">${!todo.assigneeUserId ? '未分配' : !todo.priorityKey ? '未定级' : '大工作量'}</span><span class="aipm-attention__title">${escapeHTML(todo.title)}</span><span class="aipm-attention__stage">${escapeHTML(stageName(board, todo))}　›</span></button>`).join('') || '<div class="aipm-empty">暂无需要特别关注的需求</div>'}</div></section>`;
}
function renderRequirementTable(board, members) {
    const todos = allTodos(board);
    const priorities = board.priorityOrder || [];
    const stages = board.columnOrder || [];
    return `<section class="aipm-page-head aipm-page-head--compact"><div><div class="aipm-eyebrow">需求管理</div><h2>需求池</h2><p>先明确问题与价值，再拆分、定级、排入迭代。</p></div><div class="aipm-page-head__actions"><button class="btn" id="aipmQuickCreate" type="button">＋ 新建需求</button></div></section><section class="aipm-panel aipm-requirements-panel"><div class="aipm-toolbar"><div class="aipm-search"><span>⌕</span><input id="aipmRequirementSearch" placeholder="搜索需求标题或描述" autocomplete="off"></div><select id="aipmPriorityFilter" class="aipm-select"><option value="">全部优先级</option>${priorities.map((item) => `<option value="${escapeHTML(item.key)}">${escapeHTML(item.name)}</option>`).join('')}</select><select id="aipmStageFilter" class="aipm-select"><option value="">全部阶段</option>${stages.map((item) => `<option value="${escapeHTML(item.key)}">${escapeHTML(item.name)}</option>`).join('')}</select><label class="aipm-check"><input type="checkbox" id="aipmUnassignedFilter"> 仅看未分配</label><span class="aipm-toolbar__count" id="aipmRequirementCount">${todos.length} 项</span></div><div class="aipm-table-wrap"><table class="aipm-table"><thead><tr><th>需求</th><th>优先级</th><th>阶段</th><th>负责人</th><th>迭代</th><th>点数</th><th>更新时间</th></tr></thead><tbody id="aipmRequirementRows">${todos.map((todo) => renderRequirementRow(board, members, todo)).join('') || '<tr><td colspan="7"><div class="aipm-empty">暂无需求，先新建一个需求吧</div></td></tr>'}</tbody></table></div></section>`;
}
function renderRequirementRow(board, members, todo) {
    const p = priority(board, todo);
    return `<tr class="aipm-requirement-row" data-aipm-row data-title="${escapeHTML(`${todo.title} ${todo.body || ''}`.toLowerCase())}" data-priority="${escapeHTML(todo.priorityKey || '')}" data-stage="${escapeHTML(todo.columnKey || todo.status || '')}" data-assignee="${todo.assigneeUserId ? 'assigned' : 'unassigned'}" data-aipm-todo="${todo.localId}"><td><div class="aipm-req-title"><span class="aipm-req-id">#${todo.localId}</span><strong>${escapeHTML(todo.title || '未命名需求')}</strong></div><div class="aipm-req-summary">${escapeHTML((todo.body || '暂无描述').replace(/\s+/g, ' ').slice(0, 100))}</div></td><td><span class="aipm-priority" style="--priority:${escapeHTML(p.color)}"><i></i>${escapeHTML(p.label)}</span></td><td><span class="aipm-stage" style="--stage:${escapeHTML(stageColor(board, todo))}">${escapeHTML(stageName(board, todo))}</span></td><td><span class="aipm-person">${escapeHTML(memberName(members, todo.assigneeUserId))}</span></td><td>${escapeHTML(todo.sprintId ? `Sprint #${todo.sprintId}` : '未排期')}</td><td><strong class="aipm-points">${todo.estimationPoints || '—'}</strong></td><td class="aipm-date">${escapeHTML(formatDateTime(todo.updatedAt))}</td></tr>`;
}
function renderSchedule(board, members, sprints) {
    const todos = allTodos(board);
    const groups = [...sprints].sort((a, b) => Number(b.id) - Number(a.id)).map((sprint) => ({ sprint, todos: todos.filter((todo) => todo.sprintId === sprint.id) }));
    const unscheduled = todos.filter((todo) => !todo.sprintId);
    const renderGroup = (sprint, items) => {
        const p = progress(items);
        const state = String(sprint.state || '').toLowerCase();
        return `<section class="aipm-schedule-card"><div class="aipm-schedule-card__head"><div><div class="aipm-sprint-state ${state === 'active' ? 'is-active' : ''}">${state === 'active' ? '进行中' : sprint.closedAt ? '已结束' : '未开始'}</div><h3>${escapeHTML(sprint.name)}</h3><p>${formatDate(sprint.plannedStartAt)} — ${formatDate(sprint.plannedEndAt)}</p></div><div class="aipm-sprint-kpi"><strong>${p.done}/${items.length}</strong><span>完成</span></div></div><div class="aipm-progress"><span style="width:${p.percent}%"></span></div><div class="aipm-schedule-card__meta"><span>${items.length} 项需求</span><span>${p.points} 点</span><strong>${p.percent}%</strong></div><div class="aipm-schedule-items">${items.slice(0, 8).map((todo) => `<button type="button" class="aipm-schedule-item" data-aipm-todo="${todo.localId}"><span class="aipm-schedule-item__stage" style="--stage:${escapeHTML(stageColor(board, todo))}"></span><span>${escapeHTML(todo.title)}</span><small>${escapeHTML(memberName(members, todo.assigneeUserId))}</small></button>`).join('') || '<div class="aipm-empty">此迭代还没有需求</div>'}</div>${items.length > 8 ? `<div class="aipm-more">还有 ${items.length - 8} 项需求</div>` : ''}</section>`;
    };
    return `<section class="aipm-page-head aipm-page-head--compact"><div><div class="aipm-eyebrow">计划与承诺</div><h2>迭代排期</h2><p>按迭代看清承诺范围、工作量和交付进度。</p></div><div class="aipm-page-head__actions"><button class="btn btn--ghost" id="aipmRefreshSprints" type="button">刷新迭代</button></div></section><div class="aipm-schedule-grid">${groups.map(({ sprint, todos: items }) => renderGroup(sprint, items)).join('')}${unscheduled.length ? `<section class="aipm-schedule-card aipm-schedule-card--backlog"><div class="aipm-schedule-card__head"><div><div class="aipm-sprint-state">需求池</div><h3>未排期需求</h3><p>等待优先级评审或进入下一迭代</p></div><div class="aipm-sprint-kpi"><strong>${unscheduled.length}</strong><span>项</span></div></div><div class="aipm-schedule-items">${unscheduled.slice(0, 8).map((todo) => `<button type="button" class="aipm-schedule-item" data-aipm-todo="${todo.localId}"><span class="aipm-schedule-item__stage" style="--stage:${escapeHTML(stageColor(board, todo))}"></span><span>${escapeHTML(todo.title)}</span><small>${escapeHTML(memberName(members, todo.assigneeUserId))}</small></button>`).join('')}</div></section>` : ''}${!groups.length && !unscheduled.length ? '<div class="aipm-panel aipm-empty-panel"><div class="aipm-empty">暂无迭代或未排期需求</div></div>' : ''}</div>`;
}
export function buildWorkbenchContent(board, view, members, sprints, legacyBoardHtml) {
    if (view === 'board')
        return legacyBoardHtml;
    if (view === 'overview')
        return renderOverview(board, members, sprints);
    if (view === 'schedule')
        return renderSchedule(board, members, sprints);
    return renderRequirementTable(board, members);
}
export function buildProjectWorkbench(options) {
    const { board, view, members, sprints, legacyBoardHtml } = options;
    return `<div class="aipm-workspace" data-aipm-workspace data-aipm-slug="${escapeHTML(options.slug)}"><aside class="aipm-sidebar"><div class="aipm-brand"><div class="aipm-brand__mark">A</div><div><strong>AIPM 工作台</strong><span>轻量产研管理</span></div></div><div class="aipm-sidebar__label">工作区</div>${renderNav(view)}<div class="aipm-sidebar__footer"><div class="aipm-local-badge"><i></i><span><strong>本地部署</strong><small>SQLite 数据库</small></span></div></div></aside><main class="aipm-workspace__main">${renderProjectHeader(board, view)}<div class="aipm-workspace__content" id="workspaceContent">${buildWorkbenchContent(board, view, members, sprints, legacyBoardHtml)}</div></main><div class="aipm-drawer-backdrop" id="aipmDrawerBackdrop"></div><aside class="aipm-drawer" id="aipmTodoDrawer" aria-hidden="true"></aside></div>`;
}
function bindTodoOpeners(root, board, members, role) {
    if (root[contentBoundKey])
        return;
    root.addEventListener('click', (event) => {
        const target = event.target;
        const trigger = target?.closest('[data-aipm-todo]');
        if (!trigger || !root.contains(trigger))
            return;
        // Legacy board cards retain their own click/flow handlers.
        if (trigger.closest('.board'))
            return;
        const localId = Number(trigger.dataset.aipmTodo);
        const todo = allTodos(board).find((item) => item.localId === localId);
        if (todo)
            openDrawer(todo, board, members, role);
    });
    root[contentBoundKey] = true;
}
function openDrawer(todo, board, members, role) {
    const drawer = document.getElementById('aipmTodoDrawer');
    const backdrop = document.getElementById('aipmDrawerBackdrop');
    if (!drawer || !backdrop)
        return;
    const p = priority(board, todo);
    drawer.innerHTML = `<div class="aipm-drawer__head"><div><span class="aipm-req-id">#${todo.localId}</span><h3>${escapeHTML(todo.title)}</h3></div><button class="btn btn--ghost" type="button" id="aipmDrawerClose">✕</button></div><div class="aipm-drawer__body"><div class="aipm-drawer__badges"><span class="aipm-stage" style="--stage:${escapeHTML(stageColor(board, todo))}">${escapeHTML(stageName(board, todo))}</span><span class="aipm-priority" style="--priority:${escapeHTML(p.color)}"><i></i>${escapeHTML(p.label)}</span></div><div class="aipm-drawer__section"><div class="aipm-drawer__label">用户问题 / 需求说明</div><div class="aipm-drawer__description">${escapeHTML(todo.body || '暂无描述')}</div></div><div class="aipm-drawer__facts"><div><span>负责人</span><strong>${escapeHTML(memberName(members, todo.assigneeUserId))}</strong></div><div><span>所属迭代</span><strong>${escapeHTML(todo.sprintId ? `Sprint #${todo.sprintId}` : '未排期')}</strong></div><div><span>工作量</span><strong>${todo.estimationPoints || '未估算'} 点</strong></div><div><span>更新时间</span><strong>${escapeHTML(formatDateTime(todo.updatedAt))}</strong></div></div><div class="aipm-drawer__section"><div class="aipm-drawer__label">标签</div><div class="aipm-tags">${(todo.tags || []).map((tag) => `<span>${escapeHTML(tag)}</span>`).join('') || '<em>暂无标签</em>'}</div></div></div><div class="aipm-drawer__foot"><button class="btn btn--ghost" type="button" id="aipmDrawerOpenBoard">在看板中打开</button><button class="btn" type="button" id="aipmDrawerEdit">编辑需求</button></div>`;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('is-open');
    document.getElementById('aipmDrawerClose')?.addEventListener('click', closeDrawer);
    document.getElementById('aipmDrawerEdit')?.addEventListener('click', () => openTodoDialog({ mode: 'edit', todo, onNavigateToLinkedTodo: navigate, role: role || null }));
    document.getElementById('aipmDrawerOpenBoard')?.addEventListener('click', () => navigate(`/${board.project.slug}/t/${todo.localId}`));
}
function closeDrawer() {
    document.getElementById('aipmTodoDrawer')?.classList.remove('is-open');
    document.getElementById('aipmTodoDrawer')?.setAttribute('aria-hidden', 'true');
    document.getElementById('aipmDrawerBackdrop')?.classList.remove('is-open');
}
function bindRequirementFilters(root) {
    if (root[contentBoundKey])
        return;
    const apply = () => {
        const query = (root.querySelector('#aipmRequirementSearch')?.value || '').trim().toLowerCase();
        const priorityValue = root.querySelector('#aipmPriorityFilter')?.value || '';
        const stageValue = root.querySelector('#aipmStageFilter')?.value || '';
        const unassigned = root.querySelector('#aipmUnassignedFilter')?.checked;
        let count = 0;
        root.querySelectorAll('[data-aipm-row]').forEach((row) => {
            const matches = (!query || (row.dataset.title || '').includes(query)) && (!priorityValue || row.dataset.priority === priorityValue) && (!stageValue || row.dataset.stage === stageValue) && (!unassigned || row.dataset.assignee === 'unassigned');
            row.hidden = !matches;
            if (matches)
                count += 1;
        });
        const countNode = root.querySelector('#aipmRequirementCount');
        if (countNode)
            countNode.textContent = `${count} 项`;
    };
    root.addEventListener('input', (event) => {
        if (event.target?.closest('#aipmRequirementSearch'))
            apply();
    });
    root.addEventListener('change', (event) => {
        if (event.target?.closest('#aipmPriorityFilter, #aipmStageFilter, #aipmUnassignedFilter'))
            apply();
    });
    root[contentBoundKey] = true;
}
export function bindProjectWorkbench(options) {
    exposeWorkbenchState();
    const root = document.querySelector('[data-aipm-workspace]');
    if (!root)
        return;
    if (!root[boundKey]) {
        root.querySelectorAll('[data-aipm-view]').forEach((button) => button.addEventListener('click', () => {
            const view = button.dataset.aipmView;
            if (view && view !== getWorkspaceView(options.slug)) {
                setWorkspaceView(view, options.slug);
                options.onViewChange(view);
            }
        }));
        root.querySelector('#aipmDrawerBackdrop')?.addEventListener('click', closeDrawer);
        root[boundKey] = true;
    }
    const content = root.querySelector('#workspaceContent');
    if (content) {
        bindTodoOpeners(content, options.board, options.members, options.role);
        bindRequirementFilters(content);
    }
    const quickCreate = root.querySelector('#aipmQuickCreate');
    if (quickCreate && !quickCreate[boundKey]) {
        quickCreate.addEventListener('click', () => openTodoDialog({ mode: 'create', role: options.role || null }));
        quickCreate[boundKey] = true;
    }
    const refreshSprints = root.querySelector('#aipmRefreshSprints');
    if (refreshSprints && !refreshSprints[boundKey]) {
        refreshSprints.addEventListener('click', async () => {
            sprintCache.delete(options.slug);
            await preloadWorkbenchSprints(options.slug);
            options.onViewChange('schedule');
        });
        refreshSprints[boundKey] = true;
    }
}
