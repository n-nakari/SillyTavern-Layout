import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "SillyTavern-Layout";

// 默认设置对象
const defaultSettings = {
    fullscreen: false,
    bottomBarPosition: 0, // 底栏上下位置
    showBarReply: false,
    preventArrowOverlap: false,
    bottomBarPadding: 50, // 底栏上边距
    tripleClickEdit: false, // 三击编辑正文
    limitMesHeight: false, // 限制楼层高度开关
    mesHeight: 550, // 楼层高度
    mesMarginTop: 0, // 正文上边距
    onlyHideTopBar: false, // 仅隐藏顶栏
    inputModeEnabled: false,
    inputMode: 'onlySend', // 默认选中一项，避免空白
    collapseQR: false,
    collapsePreset: false,
    collapseUser: false,
    worldInfoLayout: false,
    preventAutoFocus: false, // 默认不自动聚焦输入框选项
    hideBottomBarOnEdit: false, // 编辑正文时隐藏底栏
    moveEditButtons: false, // 编辑按钮挪到右下角
    editBtnPosBottom: 50, 
    editBtnPosRight: 20,
    editBtnPosBottomLast: 70, // 微调最新回复的上下位置
    fixedReasoning: false, // 思维链高度固定
    customOptions: [] // 自定义选项
};

// 初始化与补全设置
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
for (const [key, value] of Object.entries(defaultSettings)) {
    if (extension_settings[extensionName][key] === undefined) {
        extension_settings[extensionName][key] = value;
    }
}

const settings = extension_settings[extensionName];

// ----------------- 三击编辑功能状态变量 -----------------
let savedScrollPosition = 0;
let savedMesTextScrollPosition = 0;
let savedMesId = null;
let isTripleClickEditing = false;

// --- 拦截 jQuery 的 closest 和 find 方法，以修复将按钮移出 .mes_block 后引发的原生逻辑报错 ---
const originalClosest = $.fn.closest;
$.fn.closest = function(selectors, context) {
    if (settings && settings.moveEditButtons && selectors === '.mes_block') {
        const isButton = originalClosest.call(this, '.mes_buttons, .mes_edit_buttons');
        if (isButton.length && isButton.parent().hasClass('mes')) {
            return isButton.parent().children('.mes_block');
        }
    }
    return originalClosest.apply(this, arguments);
};

const originalFind = $.fn.find;
$.fn.find = function(selector) {
    if (settings && settings.moveEditButtons && typeof selector === 'string') {
        if (selector.includes('.mes_buttons') || selector.includes('.mes_edit_buttons')) {
            if (this.hasClass('mes_block') && this.parent().hasClass('mes')) {
                return originalFind.call(this.parent(), selector);
            }
        }
    }
    return originalFind.apply(this, arguments);
};

// === 核心功能：双重拦截全局输入框自动聚焦，彻底防手机键盘弹出 ===
const originalFocus = HTMLElement.prototype.focus;
let lastDirectInputInteraction = 0;
let lastTabInteraction = 0;

// 1. 监听真实的物理操作（触摸或点击）。如果点击在输入框、文本域或其Label上，则记录时间
const updateInteractionTime = (e) => {
    if (e.target.closest('input, textarea, label')) {
        lastDirectInputInteraction = Date.now();
    }
};

// 增加 touchstart, touchend 和 mousedown，解决移动端 Chrome 事件触发顺序导致 focus 抢在 pointerdown 之前的问题
document.addEventListener('pointerdown', updateInteractionTime, { capture: true, passive: true });
document.addEventListener('touchstart', updateInteractionTime, { capture: true, passive: true });
document.addEventListener('touchend', updateInteractionTime, { capture: true, passive: true });
document.addEventListener('mousedown', updateInteractionTime, { capture: true, passive: true });

// 2. 为了兼容PC端键盘Tab切换逻辑
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        lastTabInteraction = Date.now();
    }
}, { capture: true });

// 3. 拦截 JS 代码中主动调用的 .focus()
HTMLElement.prototype.focus = function(options) {
    if (settings.preventAutoFocus) {
        const tag = this.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            const isUserInitiated = (Date.now() - lastDirectInputInteraction < 1000) || (Date.now() - lastTabInteraction < 1000);
            const isAlreadyFocused = (document.activeElement === this);
            
            // 如果不是用户真实点击发起的，且当前元素没有被聚焦，则拦截
            if (!isUserInitiated && !isAlreadyFocused) {
                return;
            }
        }
    }
    return originalFocus.call(this, options);
};

// 4. 拦截绕过JS（如 <dialog> 原生显示、autofocus 属性等）导致的底层强制聚焦
document.addEventListener('focus', (e) => {
    if (settings.preventAutoFocus) {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            const isUserInitiated = (Date.now() - lastDirectInputInteraction < 1000) || (Date.now() - lastTabInteraction < 1000);
            
            // 如果不是用户主动点击或Tab切换进来的聚焦，立即强制失焦(blur)，彻底掐断键盘弹出的可能
            if (!isUserInitiated) {
                e.target.blur();
            }
        }
    }
}, true); // 必须在捕获阶段执行，抢在键盘响应前拦截
// =========================================================

/**
 * [三击编辑] 将 Textarea 滚动到指定的字符串索引位置（置顶显示）
 */
function scrollToIndexInTextarea(textarea, index) {
    const mirror = document.createElement('div');
    const style = window.getComputedStyle(textarea);

    // 仅复制影响排版的属性，去掉会影响宽度计算的 border 等
    const properties = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 
        'letterSpacing', 'lineHeight', 'textDecoration', 'textIndent', 
        'textTransform', 'whiteSpace', 'wordBreak', 'wordSpacing', 'wordWrap', 
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
    ];

    properties.forEach(prop => {
        mirror.style[prop] = style[prop];
    });

    // 【关键修复】使用 clientWidth 精确复刻可用排版宽度，排除滚动条占用的物理宽度导致长文本折行偏移的问题
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = textarea.clientWidth + 'px';
    mirror.style.border = 'none';

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.overflow = 'hidden';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';

    const textUpToIndex = textarea.value.substring(0, index);
    const escapeHtml = (t) => t.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);

    // 依赖 pre-wrap 原生渲染换行，彻底避免 replace('<br>') 可能造成的行高差异，锚点使用零宽字符
    mirror.innerHTML = escapeHtml(textUpToIndex) + '<span id="caret-marker">&#8203;</span>';

    document.body.appendChild(mirror);

    const marker = mirror.querySelector('#caret-marker');
    let targetTop = marker.offsetTop;

    // 向下偏移约两行的高度，避免目标段落完全贴在输入框顶部，提供更好的阅读上下文体验
    const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) || 20;
    targetTop -= lineHeight * 2;
    if (targetTop < 0) targetTop = 0;

    document.body.removeChild(mirror);

    textarea.scrollTop = targetTop;
    textarea.setSelectionRange(index, index);
    textarea.focus();
}

/**
 * [三击编辑] 智能模糊匹配算法：在原始文本中寻找对应的段落索引
 */
function findBestMatchIndex(rawText, pText) {
    let masked = rawText.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
    masked = masked.replace(/<[^>]+>/g, match => ' '.repeat(match.length));

    const coreRegex = /[\p{L}\p{N}]/u;
    const rawMap = [];
    for (let i = 0; i < masked.length; i++) {
        if (coreRegex.test(masked[i])) {
            rawMap.push({ char: masked[i], index: i });
        }
    }

    let pChars = "";
    for (let i = 0; i < pText.length; i++) {
        if (coreRegex.test(pText[i])) {
            pChars += pText[i];
        }
    }

    if (pChars.length === 0) return 0;

    const N = Math.min(pChars.length, 40);
    const searchTarget = pChars.substring(0, N);

    let bestMatchRawIndex = -1;
    let maxMatches = -1;
    let minSpan = Infinity;

    for (let i = 0; i < rawMap.length; i++) {
        let startIdx = searchTarget.indexOf(rawMap[i].char);
        if (startIdx === -1 || startIdx > 15) continue;

        let pIdx = startIdx;
        let matches = 0;
        let rawIdx = i;
        
        while (pIdx < N && rawIdx < rawMap.length && (rawIdx - i) < N + 30) {
            if (rawMap[rawIdx].char === searchTarget[pIdx]) {
                matches++;
                pIdx++;
                rawIdx++;
            } else {
                let nextRawMatches = (rawIdx + 1 < rawMap.length && rawMap[rawIdx+1].char === searchTarget[pIdx]);
                let nextPMatches = (pIdx + 1 < N && rawMap[rawIdx].char === searchTarget[pIdx+1]);
                
                if (nextRawMatches && !nextPMatches) {
                    rawIdx++; 
                } else if (nextPMatches && !nextRawMatches) {
                    pIdx++;   
                } else {
                    rawIdx++;
                    pIdx++;
                }
            }
        }
        
        if (matches > maxMatches || (matches === maxMatches && (rawIdx - i) < minSpan)) {
            maxMatches = matches;
            minSpan = rawIdx - i;
            bestMatchRawIndex = rawMap[i].index;
        }
    }

    if (maxMatches < N * 0.3) {
        return 0;
    }

    return bestMatchRawIndex;
}

/**
 * [三击编辑] 触发进入编辑模式并自动定位
 */
async function initiateEdit(pElement) {
    const $mes = $(pElement).closest('.mes');
    const mesId = $mes.attr('mesid');

    if (!mesId) return;

    const pText = $(pElement).text().trim();

    // 保存原始聊天窗口滚动位置以及（如果开启了限制楼层高度）楼层正文内容的滚动位置
    savedMesId = mesId;
    savedScrollPosition = $('#chat').scrollTop();
    
    const $mesText = $mes.find('.mes_text');
    savedMesTextScrollPosition = $mesText.length ? $mesText.scrollTop() : 0;
    
    isTripleClickEditing = true;

    // 模拟点击自带的“编辑”按钮进入编辑模式
    $mes.find('.mes_edit').trigger('click');

    let $textarea = null;
    let attempts = 0;
    
    await new Promise((resolve) => {
        function checkTextarea() {
            $textarea = $('#curEditTextarea');
            if ($textarea.length > 0) {
                $textarea.css('opacity', '0');
                if ($textarea.val().length > 0) {
                    return resolve();
                }
            }
            
            attempts++;
            if (attempts > 60) { 
                return resolve();
            }
            requestAnimationFrame(checkTextarea);
        }
        requestAnimationFrame(checkTextarea);
    });

    if (!$textarea || $textarea.length === 0 || $textarea.val().length === 0) {
        if ($textarea && $textarea.length > 0) $textarea.css('opacity', '1');
        return;
    }

    try {
        const rawText = $textarea.val();
        const targetIndex = findBestMatchIndex(rawText, pText);
        scrollToIndexInTextarea($textarea[0], targetIndex);
    } finally {
        $textarea.css('opacity', '1');
    }
}


// 插件的UI HTML
const uiHTML = `
<div class="inline-drawer wide100p flexFlowColumn" id="te-settings-drawer">
    <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
        <b><span>布局优化</span></b>
        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
    </div>
    <div class="inline-drawer-content" style="display: none;">
        
        <label class="checkbox_label">
            <input type="checkbox" id="te_fullscreen" />
            <span>启用全屏模式</span>
        </label>
        
        <div id="te_fs_options" class="te-sub-options">
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">底栏上下位置：</span>
                <input type="number" id="te_bottom_bar_pos" class="text_pole" style="width: 100px; text-align: center;" value="0">
            </div>
            
            <label class="checkbox_label">
                <input type="checkbox" id="te_show_bar_reply" />
                <span>AI回复时显示底栏</span>
            </label>
            <label class="checkbox_label">
                <input type="checkbox" id="te_only_hide_top_bar" />
                <span>仅隐藏顶栏</span>
            </label>
        </div>

        <label class="checkbox_label">
            <input type="checkbox" id="te_prevent_arrow_overlap" />
            <span>底栏不挡切换消息箭头</span>
        </label>
        <div id="te_arrow_overlap_options" class="te-sub-options">
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">底栏上边距：</span>
                <input type="number" id="te_bottom_bar_padding" class="text_pole" style="width: 100px; text-align: center;" value="20">
            </div>
        </div>

        <label class="checkbox_label">
            <input type="checkbox" id="te_triple_click_edit" />
            <span>三击段落进入编辑</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_limit_mes_height" />
            <span>限制楼层高度</span>
        </label>
        <div id="te_mes_height_options" class="te-sub-options">
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">高度：</span>
                <input type="number" id="te_mes_height" class="text_pole" style="width: 100px; text-align: center;" value="550">
            </div>
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">正文上边距：</span>
                <input type="number" id="te_mes_margin_top" class="text_pole" style="width: 100px; text-align: center;" value="0">
            </div>
        </div>

        <label class="checkbox_label">
            <input type="checkbox" id="te_fixed_reasoning" />
            <span>限制思维链展开高度</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_prevent_auto_focus" />
            <span>禁止自动弹出输入法</span>
        </label>
        
        <label class="checkbox_label">
            <input type="checkbox" id="te_hide_bottom_bar_on_edit" />
            <span>编辑正文时隐藏底栏</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_move_edit_buttons" />
            <span>编辑按钮移到正文底部</span>
        </label>
        <div id="te_edit_buttons_options" class="te-sub-options">
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">上下位置：</span>
                <input type="number" id="te_edit_btn_pos_bottom" class="text_pole" style="width: 100px; text-align: center;" value="30">
            </div>
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">左右位置：</span>
                <input type="number" id="te_edit_btn_pos_right" class="text_pole" style="width: 100px; text-align: center;" value="20">
            </div>
            <div class="flex-container alignitemscenter margin-b-5">
                <span class="te-setting-title">最新楼层微调上下位置：</span>
                <input type="number" id="te_edit_btn_pos_bottom_last" class="text_pole" style="width: 100px; text-align: center;" value="30">
            </div>
        </div>

        <div class="flex-container flexFlowColumn">
            <label class="checkbox_label">
                <input type="checkbox" id="te_input_mode_enabled" />
                <span>输入时底栏布局</span>
            </label>
            <div id="te_input_options" class="te-sub-options">
                <label class="checkbox_label">
                    <input type="checkbox" class="te-radio-checkbox" data-group="inputMode" value="onlySend">
                    <span>只显示发送键</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" class="te-radio-checkbox" data-group="inputMode" value="upper">
                    <span>输入框占满上行</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" class="te-radio-checkbox" data-group="inputMode" value="lower">
                    <span>输入框占满下行</span>
                </label>
            </div>
        </div>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_qr" />
            <span>快速回复折叠</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_preset" />
            <span>预设界面折叠</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_user" />
            <span>用户设置界面折叠</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_world_info_layout" />
            <span>世界书布局修改</span>
        </label>
        
        <div class="flex-container alignitemscenter te-custom-options-header">
            <span class="te-setting-title">自定义选项</span>
            <div id="te_add_custom_option" class="menu_button menu_button_icon fa-solid fa-plus" title="添加选项" style="margin: 5px 0;"></div>
        </div>
        <div id="te_custom_options_container" class="flex-container flexFlowColumn" style="gap: 0;"></div>
    </div>
</div>
`;

// 刷新 CSS class
function updateBodyClasses() {
    $('body').toggleClass('te-fullscreen', Boolean(settings.fullscreen));
    $('body').toggleClass('te-show-bar-reply', Boolean(settings.fullscreen && settings.showBarReply));
    $('body').toggleClass('te-prevent-arrow-overlap', Boolean(settings.preventArrowOverlap));
    $('body').toggleClass('te-limit-mes-height', Boolean(settings.limitMesHeight));
    $('body').toggleClass('te-only-hide-top-bar', Boolean(settings.fullscreen && settings.onlyHideTopBar));
    $('body').toggleClass('te-hide-bottom-bar-on-edit', Boolean(settings.hideBottomBarOnEdit));
    $('body').toggleClass('te-move-edit-buttons', Boolean(settings.moveEditButtons));
    $('body').toggleClass('te-fixed-reasoning', Boolean(settings.fixedReasoning));
    
    // 应用可自定义的 CSS 变量
    document.body.style.setProperty('--te-bottom-bar-pos', settings.bottomBarPosition);
    document.body.style.setProperty('--te-bottom-bar-padding', settings.bottomBarPadding);
    document.body.style.setProperty('--te-mes-height', settings.mesHeight);
    document.body.style.setProperty('--te-mes-margin-top', settings.mesMarginTop);
    document.body.style.setProperty('--te-edit-btn-bottom', settings.editBtnPosBottom);
    document.body.style.setProperty('--te-edit-btn-right', settings.editBtnPosRight);
    document.body.style.setProperty('--te-edit-btn-bottom-last', settings.editBtnPosBottomLast);
    
    $('body').removeClass('te-input-onlySend te-input-upper te-input-lower');
    if (settings.inputModeEnabled && settings.inputMode) {
        $('body').addClass(`te-input-${settings.inputMode}`);
    }

    $('body').toggleClass('te-collapse-qr', Boolean(settings.collapseQR));
    $('body').toggleClass('te-collapse-user', Boolean(settings.collapseUser));
    $('body').toggleClass('te-world-info-layout', Boolean(settings.worldInfoLayout));
}

// 核心：基于 DOM 结构和 HTML 修改的操作函数
function doDOMManipulations() {
    // -----------------------------------------
    // 1. 预设编辑页面：动态大容器包裹与自动分配内联样式 (现改为全局生效)
    // -----------------------------------------
    const presetForm = $('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (presetForm.length) {
        if (!presetForm.find('#te-preset-header-wrap').length) {
            const containers = presetForm.children('.flex-container').slice(0, 2);
            
            containers.wrapAll('<div id="te-preset-header-wrap" style="display:flex; flex-wrap:wrap; gap:10px; width:100%;"></div>');
            containers.attr('style', 'display: contents !important;');
            
            containers.find('.completion_prompt_manager_popup_entry_form_control')
                      .not(':has(#completion_prompt_manager_popup_entry_form_name)')
                      .attr('style', 'flex: 1 1 0 !important; min-width: 0 !important;');
            
            containers.find('select, input').attr('style', 'width: 100% !important; min-width: 0 !important;');
        }
    }

    // -----------------------------------------
    // 2. 世界书条目：三个功能按钮的容器包裹
    // -----------------------------------------
    if (settings.worldInfoLayout) {
        $('.wi-card-entry .inline-drawer-header').each(function() {
            const $header = $(this);
            if (!$header.find('.te-wi-btn-wrapper').length) {
                // 将移动、复制、删除按钮打包裹入新容器
                $header.find('.move_entry_button, .duplicate_entry_button, .delete_entry_button')
                       .wrapAll('<div class="te-wi-btn-wrapper"></div>');
            }
        });
    } else {
        // 还原解包
        $('.wi-card-entry .te-wi-btn-wrapper').each(function() {
            const $wrap = $(this);
            $wrap.children().unwrap(); 
        });
    }

    // -----------------------------------------
    // 3. 编辑按钮位置调整
    // -----------------------------------------
    if (settings.moveEditButtons) {
        $('.mes').each(function() {
            const $mes = $(this);
            const $buttons = $mes.find('.mes_buttons, .mes_edit_buttons');
            // 若不是.mes的直系子元素则移动出来
            if ($buttons.length && $buttons.parent()[0] !== $mes[0]) {
                $mes.append($buttons);
            }
        });
    } else {
        // 还原回酒馆原生位置 (.ch_name中)
        $('.mes').each(function() {
            const $mes = $(this);
            const $buttons = $mes.children('.mes_buttons, .mes_edit_buttons');
            if ($buttons.length) {
                $mes.find('.ch_name').append($buttons);
            }
        });
    }
}

// 防抖的全局监听器，捕获所有动态弹出的界面并立刻应用 HTML 修改
let domManipTimeout;
const domObserver = new MutationObserver(() => {
    clearTimeout(domManipTimeout);
    domManipTimeout = setTimeout(doDOMManipulations, 50);
});

// 预设界面折叠处理函数 - 改为纯CSS方案避免引起跳动和冲突
function togglePresetCollapse(enable) {
    if (enable) {
        if ($('#te-preset-drawer-header').length) return;
        const header = $(`
            <div id="te-preset-drawer-header" class="inline-drawer wide100p flexFlowColumn">
                <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
                    <b><span>预设设置</span></b>
                    <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                </div>
            </div>
        `);
        $('#respective-ranges-and-temps').before(header);

        // 默认状态为折叠
        $('body').addClass('te-preset-collapsed');

        header.find('.inline-drawer-toggle').on('click', function() {
            $('body').toggleClass('te-preset-collapsed');
            const icon = $(this).find('.inline-drawer-icon');
            if ($('body').hasClass('te-preset-collapsed')) {
                icon.removeClass('up').addClass('down');
            } else {
                icon.removeClass('down').addClass('up');
            }
        });
    } else {
        $('#te-preset-drawer-header').remove();
        $('body').removeClass('te-preset-collapsed');
    }
}

// 用户设置界面重排及折叠处理函数
function toggleUserCollapse(enable) {
    if (enable) {
        if (!$('#te-user-wrapper-1').length) {
            const wrap1 = $(`
                <div id="te-user-wrapper-1" class="inline-drawer wide100p flexFlowColumn">
                    <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
                        <b><span>界面效果</span></b>
                        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;"></div>
                </div>
            `);
            const fontBlock = $('div[name="FontBlurChatWidthBlock"]');
            const toggleBlock = $('div[name="themeToggles"]');
            
            fontBlock.before('<div id="te-placeholder-font" style="display:none;"></div>');
            toggleBlock.before('<div id="te-placeholder-toggle" style="display:none;"></div>');
            wrap1.find('.inline-drawer-content').append(fontBlock).append(toggleBlock);
            $('#te-settings-drawer').before(wrap1);
        }

        if (!$('#te-placeholder-char').length) {
            const charHandling = $('div[name="CharacterHandlingToggles"]');
            const miscToggles = $('div[name="MiscellaneousToggles"]');
            const customCss = $('#CustomCSS-block');
            const chatHandling = $('div[name="ChatMessageHandlingToggles"]');

            charHandling.before('<div id="te-placeholder-char" style="display:none;"></div>');
            miscToggles.before('<div id="te-placeholder-misc" style="display:none;"></div>');
            customCss.before('<div id="te-placeholder-css" style="display:none;"></div>');

            chatHandling.before(customCss);
            chatHandling.before(charHandling);
            chatHandling.before(miscToggles);
            $('#UI-Customization').hide();
        }
    } else {
        if ($('#te-user-wrapper-1').length) {
            $('#te-placeholder-font').replaceWith($('div[name="FontBlurChatWidthBlock"]'));
            $('#te-placeholder-toggle').replaceWith($('div[name="themeToggles"]'));
            $('#te-user-wrapper-1').remove();
        }
        if ($('#te-placeholder-char').length) {
            $('#te-placeholder-char').replaceWith($('div[name="CharacterHandlingToggles"]'));
            $('#te-placeholder-misc').replaceWith($('div[name="MiscellaneousToggles"]'));
            $('#te-placeholder-css').replaceWith($('#CustomCSS-block'));
            $('#UI-Customization').show();
        }
    }
}

// 渲染及应用自定义选项CSS的函数
function applyCustomOptions() {
    settings.customOptions.forEach(opt => {
        const styleId = `te_custom_style_${opt.id}`;
        $(`#${styleId}`).remove();
        if (opt.enabled && opt.css) {
            $('head').append(`<style id="${styleId}">${opt.css}</style>`);
        }
    });
}

function renderCustomOptions() {
    const container = $('#te_custom_options_container');
    container.empty();
    settings.customOptions.forEach(opt => {
        container.append(`
            <div class="flex-container alignitemscenter margin-b-5">
                <label class="checkbox_label" style="flex: 1; margin-left: 0;">
                    <input type="checkbox" class="te-custom-checkbox" data-id="${opt.id}" ${opt.enabled ? 'checked' : ''} />
                    <span>${opt.name}</span>
                </label>
                <div class="menu_button menu_button_icon fa-solid fa-pencil te-custom-edit" data-id="${opt.id}" title="编辑" style="margin: 5px;"></div>
                <div class="menu_button menu_button_icon fa-solid fa-trash te-custom-delete" data-id="${opt.id}" title="删除" style="margin: 5px 0;"></div>
            </div>
        `);
    });
    applyCustomOptions();
}

// 初始化插件
jQuery(async () => {
    // 注入UI
    const $target = $('div[name="themeElements"] > .inline-drawer.wide100p.flexFlowColumn').first();
    $target.before(uiHTML);

    // 默认全局注入预设提示词全屏展开按钮
    const promptContainer = $('#completion_prompt_manager_popup_edit > div > form > div.completion_prompt_manager_popup_entry_form_control > div.flex-container.alignItemsCenter').first();
    if (promptContainer.length && !$('#te_expand_preset_btn').length) {
        promptContainer.append('<i id="te_expand_preset_btn" class="editor_maximize fa-solid fa-maximize right_menu_button" data-for="completion_prompt_manager_popup_entry_form_prompt" title="全屏展开"></i>');
    }

    $('#te_fullscreen').prop('checked', settings.fullscreen);
    $('#te_bottom_bar_pos').val(settings.bottomBarPosition);
    $('#te_show_bar_reply').prop('checked', settings.showBarReply);
    $('#te_prevent_arrow_overlap').prop('checked', settings.preventArrowOverlap);
    $('#te_bottom_bar_padding').val(settings.bottomBarPadding);
    $('#te_triple_click_edit').prop('checked', settings.tripleClickEdit);
    $('#te_limit_mes_height').prop('checked', settings.limitMesHeight);
    $('#te_mes_height').val(settings.mesHeight);
    $('#te_mes_margin_top').val(settings.mesMarginTop);
    $('#te_only_hide_top_bar').prop('checked', settings.onlyHideTopBar);
    $('#te_input_mode_enabled').prop('checked', settings.inputModeEnabled);
    $('#te_collapse_qr').prop('checked', settings.collapseQR);
    $('#te_collapse_preset').prop('checked', settings.collapsePreset);
    $('#te_collapse_user').prop('checked', settings.collapseUser);
    $('#te_world_info_layout').prop('checked', settings.worldInfoLayout);
    $('#te_prevent_auto_focus').prop('checked', settings.preventAutoFocus);
    $('#te_hide_bottom_bar_on_edit').prop('checked', settings.hideBottomBarOnEdit);
    $('#te_move_edit_buttons').prop('checked', settings.moveEditButtons);
    $('#te_edit_btn_pos_bottom').val(settings.editBtnPosBottom);
    $('#te_edit_btn_pos_right').val(settings.editBtnPosRight);
    $('#te_edit_btn_pos_bottom_last').val(settings.editBtnPosBottomLast);
    $('#te_fixed_reasoning').prop('checked', settings.fixedReasoning);

    $(`.te-radio-checkbox[data-group="inputMode"][value="${settings.inputMode}"]`).prop('checked', true);

    if(settings.fullscreen) $('#te_fs_options').show();
    if(settings.preventArrowOverlap) $('#te_arrow_overlap_options').show();
    if(settings.limitMesHeight) $('#te_mes_height_options').show();
    if(settings.moveEditButtons) $('#te_edit_buttons_options').show();
    if(settings.inputModeEnabled) $('#te_input_options').show();

    // 渲染自定义选项
    renderCustomOptions();

    // 初始化方法
    updateBodyClasses();
    togglePresetCollapse(settings.collapsePreset);
    toggleUserCollapse(settings.collapseUser);
    doDOMManipulations();

    // 挂载全局 DOM 监听
    domObserver.observe(document.body, { childList: true, subtree: true });

    // ---------------- 事件绑定 ----------------

    // 插件的三击编辑事件绑定
    $('#chat').on('click', '.mes_text p', function(e) {
        if (settings.tripleClickEdit && e.detail === 3) {
            e.preventDefault();
            // 确保没有选中多余的文本干扰视线
            window.getSelection().removeAllRanges(); 
            initiateEdit(this);
        }
    });

    // 监听SillyTavern更新消息事件（恢复滚动与兼容限高）
    eventSource.on(event_types.MESSAGE_UPDATED, () => {
        if (isTripleClickEditing) {
            isTripleClickEditing = false;
            
            // 同步恢复聊天窗口滚动位置以及楼层自身高度的滚动位置
            $('#chat').scrollTop(savedScrollPosition);
            if (settings.limitMesHeight && savedMesId) {
                const $targetMes = $(`.mes[mesid="${savedMesId}"] .mes_text`);
                if ($targetMes.length) $targetMes.scrollTop(savedMesTextScrollPosition);
            }
            
            // 使用 requestAnimationFrame 在浏览器下一次重绘前再次确认位置，确保退出平滑无闪烁
            requestAnimationFrame(() => {
                $('#chat').scrollTop(savedScrollPosition);
                if (settings.limitMesHeight && savedMesId) {
                    const $targetMes = $(`.mes[mesid="${savedMesId}"] .mes_text`);
                    if ($targetMes.length) $targetMes.scrollTop(savedMesTextScrollPosition);
                }
                savedMesId = null;
            });
        }
    });

    $('.te-radio-checkbox').on('change', function() {
        if ($(this).is(':checked')) {
            const group = $(this).data('group');
            $(`.te-radio-checkbox[data-group="${group}"]`).not(this).prop('checked', false);
            settings[group] = $(this).val();
            updateBodyClasses();
            saveSettingsDebounced();
        } else {
            $(this).prop('checked', true);
        }
    });

    $('#te_fullscreen').on('change', function() {
        settings.fullscreen = $(this).is(':checked');
        settings.fullscreen ? $('#te_fs_options').slideDown(200) : $('#te_fs_options').slideUp(200);
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_bottom_bar_pos').on('input', function() {
        settings.bottomBarPosition = $(this).val() || 0;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_show_bar_reply').on('change', function() {
        settings.showBarReply = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_prevent_arrow_overlap').on('change', function() {
        settings.preventArrowOverlap = $(this).is(':checked');
        settings.preventArrowOverlap ? $('#te_arrow_overlap_options').slideDown(200) : $('#te_arrow_overlap_options').slideUp(200);
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_bottom_bar_padding').on('input', function() {
        settings.bottomBarPadding = $(this).val() || 20;
        updateBodyClasses();
        saveSettingsDebounced();
    });
    
    $('#te_triple_click_edit').on('change', function() {
        settings.tripleClickEdit = $(this).is(':checked');
        saveSettingsDebounced();
    });
    
    $('#te_limit_mes_height').on('change', function() {
        settings.limitMesHeight = $(this).is(':checked');
        settings.limitMesHeight ? $('#te_mes_height_options').slideDown(200) : $('#te_mes_height_options').slideUp(200);
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_mes_height').on('input', function() {
        settings.mesHeight = $(this).val() || 550;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_mes_margin_top').on('input', function() {
        settings.mesMarginTop = $(this).val() || 0;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_only_hide_top_bar').on('change', function() {
        settings.onlyHideTopBar = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });
    
    $('#te_move_edit_buttons').on('change', function() {
        settings.moveEditButtons = $(this).is(':checked');
        settings.moveEditButtons ? $('#te_edit_buttons_options').slideDown(200) : $('#te_edit_buttons_options').slideUp(200);
        updateBodyClasses();
        doDOMManipulations();
        saveSettingsDebounced();
    });

    $('#te_edit_btn_pos_bottom').on('input', function() {
        settings.editBtnPosBottom = $(this).val() || 30;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_edit_btn_pos_right').on('input', function() {
        settings.editBtnPosRight = $(this).val() || 20;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_edit_btn_pos_bottom_last').on('input', function() {
        settings.editBtnPosBottomLast = $(this).val() || 30;
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_fixed_reasoning').on('change', function() {
        settings.fixedReasoning = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_input_mode_enabled').on('change', function() {
        settings.inputModeEnabled = $(this).is(':checked');
        settings.inputModeEnabled ? $('#te_input_options').slideDown(200) : $('#te_input_options').slideUp(200);
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_collapse_qr').on('change', function() {
        settings.collapseQR = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_collapse_preset').on('change', function() {
        settings.collapsePreset = $(this).is(':checked');
        togglePresetCollapse(settings.collapsePreset);
        saveSettingsDebounced();
    });

    $('#te_collapse_user').on('change', function() {
        settings.collapseUser = $(this).is(':checked');
        toggleUserCollapse(settings.collapseUser);
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_world_info_layout').on('change', function() {
        settings.worldInfoLayout = $(this).is(':checked');
        updateBodyClasses();
        doDOMManipulations();
        saveSettingsDebounced();
    });

    $('#te_prevent_auto_focus').on('change', function() {
        settings.preventAutoFocus = $(this).is(':checked');
        saveSettingsDebounced();
    });
    
    $('#te_hide_bottom_bar_on_edit').on('change', function() {
        settings.hideBottomBarOnEdit = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    // ---------------- 自定义选项相关的事件绑定 ----------------
    $('#te_add_custom_option').on('click', () => {
        settings.customOptions.push({
            id: Date.now().toString(),
            name: '未命名选项',
            css: '',
            enabled: false
        });
        saveSettingsDebounced();
        renderCustomOptions();
    });

    $(document).on('change', '.te-custom-checkbox', function() {
        const id = $(this).data('id');
        const opt = settings.customOptions.find(o => o.id == id);
        if (opt) {
            opt.enabled = $(this).is(':checked');
            saveSettingsDebounced();
            applyCustomOptions();
        }
    });

    $(document).on('click', '.te-custom-delete', function() {
        const id = $(this).data('id');
        settings.customOptions = settings.customOptions.filter(o => o.id != id);
        $(`#te_custom_style_${id}`).remove();
        saveSettingsDebounced();
        renderCustomOptions();
    });

    $(document).on('click', '.te-custom-edit', function() {
        const id = $(this).data('id');
        const opt = settings.customOptions.find(o => o.id == id);
        if (!opt) return;

        // 移除可能存在的旧弹窗，避免状态残留
        $('#te_custom_option_popup').remove();

        // 插入新的编辑弹窗
        $('body').append(`
            <dialog id="te_custom_option_popup" class="popup">
                <div class="popup-body">
                    <div class="popup-content">
                        <label style="display:block;">选项名称</label>
                        <input type="text" id="te_custom_name" class="text_pole" style="width:100%;box-sizing:border-box;" />
                        <label style="display:block;margin-top:10px;">CSS内容</label>
                        <textarea id="te_custom_css" class="text_pole textarea_compact" style="width:100%;height:50dvh;box-sizing:border-box;font-family:monospace;resize:vertical;"></textarea>
                    </div>
                    <div class="popup-controls">
                        <div id="te_custom_save" class="menu_button popup-button-ok">保存</div>
                        <div id="te_custom_cancel" class="menu_button popup-button-cancel">取消</div>
                    </div>
                </div>
            </dialog>
        `);

        $('#te_custom_name').val(opt.name);
        $('#te_custom_css').val(opt.css);
        
        $('#te_custom_cancel').on('click', () => {
            const dialog = document.getElementById('te_custom_option_popup');
            if (dialog) dialog.close();
            $('#te_custom_option_popup').remove();
        });
        
        $('#te_custom_save').on('click', () => {
            opt.name = $('#te_custom_name').val();
            opt.css = $('#te_custom_css').val();
            saveSettingsDebounced();
            renderCustomOptions();
            const dialog = document.getElementById('te_custom_option_popup');
            if (dialog) dialog.close();
            $('#te_custom_option_popup').remove();
        });

        document.getElementById('te_custom_option_popup').showModal();
    });
});
