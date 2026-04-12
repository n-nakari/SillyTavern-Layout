import { getContext, getExtensionSettings, saveExtensionSettings } from "../../../../extensions.js";

const extensionName = "custom-ui-tweaks";
const styleId = "custom-ui-tweaks-styles";

// 默认设置
const defaultSettings = {
    fullscreen: false,
    fullscreenBottom: "theme",
    fullscreenReplyBar: false,
    disableAutoFocus: false,
    inputMode: "default",
    collapseQR: false,
    collapsePreset: false,
    collapseUser: false
};

let settings = Object.assign({}, defaultSettings);

// 生成并注入CSS
function updateCSS() {
    $(`#${styleId}`).remove();
    let css = "";

    // 1. 全屏模式
    if (settings.fullscreen) {
        css += `
        /* 1. 启用全屏模式 */
        #form_sheld {
          margin: 0 auto;
          position: absolute;
        }
        body:not(.waifuMode) #sheld {
          top: 0;
          height: 100dvh;
          min-height: 100dvh;
        }
        #chat {
          height: 100dvh;
          min-height: 100dvh;
        }
        #form_sheld:has(#send_textarea:focus, #send_textarea:not(:placeholder-shown)) {
          position: sticky;
        }
        #send_form {
          opacity: 0;
          transition: all 0.5s ease;
        }
        #send_form:focus-within, #send_form:hover, #send_form:has(#send_textarea:not(:placeholder-shown)) {
          opacity: 1;
        }
        #top-bar, #top-settings-holder, .drawer-toggle {
          opacity: 0;
          transition: all 0.5s ease;
        }
        body:has(.drawer-content.openDrawer, .drawer:hover) #top-bar, 
        body:has(.drawer-content.openDrawer, .drawer:hover) #top-settings-holder, 
        body:has(.drawer-content.openDrawer, .drawer:hover) .drawer-toggle {
          opacity: 1;
        }
        #extensionConnectionProfiles {
          position: absolute;
          top: calc(var(--bottomFormBlockSize) * 2);
          z-index: 100;
        }
        #extensionTopBar {
          position: absolute;
          top: var(--bottomFormBlockSize);
          z-index: 100;
          opacity: 0;
          transition: all 0.5s ease;
        }
        #extensionTopBar:focus-within, #extensionTopBar:hover, #extensionTopBar:has(#extensionTopBarSearchInput:not(:placeholder-shown), #extensionTopBarToggleConnectionProfiles.active, #extensionTopBarToggleSidebar.active) {
          opacity: 1;
        }\n`;

        // 1.1 底栏设置
        if (settings.fullscreenBottom === "bottom") {
            css += `
        /* 1.1 底栏置底 */
        #form_sheld { bottom: 0; }\n`;
        }

        // 1.2 回复时显示底栏
        if (settings.fullscreenReplyBar) {
            css += `
        /* 1.2 回复时显示底栏 */
        #send_form:has(.mes_stop[style*="display: flex"]) { opacity: 1; }\n`;
        }
    }

    // 3. 输入框模式
    if (settings.inputMode === "sendOnly") {
        css += `
        /* 3.1 只显示发送键 */
        #send_form:has(#send_textarea:focus) #leftSendForm, 
        #send_form:has(#send_textarea:focus) #quickPersonaImg, 
        #send_form:has(#send_textarea:focus) #quick-reply-rocket-button {
          display: none !important;
        }\n`;
    } else if (settings.inputMode === "fullTop") {
        css += `
        /* 3.2 占满上行 */
        #nonQRFormItems {
          display: grid;
          grid-template-columns: auto 1fr auto;
          grid-template-rows: auto auto;
          place-items: center;
        }
        #rightSendForm { grid-column: 3 / 4; }
        #send_textarea:focus, #send_textarea:not(:placeholder-shown) {
          grid-row: 1 / 2;
          grid-column: 1 / 4;
          justify-self: center;
        }\n`;
    } else if (settings.inputMode === "fullBottom") {
        css += `
        /* 3.3 占满下行 */
        #nonQRFormItems {
          display: grid;
          grid-template-columns: auto 1fr auto;
          grid-template-rows: auto auto;
          place-items: center;
        }
        #rightSendForm { grid-column: 3 / 4; }
        #send_textarea:focus, #send_textarea:not(:placeholder-shown) {
          grid-row: 2 / 3;
          grid-column: 1 / 4;
          justify-self: center;
        }\n`;
    }

    // 4. 折叠QR
    if (settings.collapseQR) {
        css += `
        /* 4. 折叠QR */
        .qr--buttons {
          opacity: 0;
          visibility: hidden;
          max-height: 0;
          transform: translateY(20px);
          pointer-events: none;
          transition: opacity 0.3s ease-in-out, visibility 0.3s ease-in-out, max-height 0.5s ease, transform 0.5s ease;
        }
        #send_form:focus-within .qr--buttons {
          opacity: 1;
          visibility: visible;
          max-height: 100px;
          transform: translateY(0);
          pointer-events: auto;
        }\n`;
    }

    // 注入页面
    if (css !== "") {
        $("head").append(`<style id="${styleId}">${css}</style>`);
    }
}

// 辅助函数：将元素包裹进SillyTavern风格的折叠面板
function wrapElements(id, title, $els) {
    if ($(`#${id}`).length > 0 || $els.length === 0) return;
    const drawerHtml = `
        <div class="inline-drawer wide100p flexFlowColumn" id="${id}">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${title}</b>
                <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
            </div>
            <div class="inline-drawer-content" style="display:none; padding-top:10px;"></div>
        </div>`;
    
    $els.first().before(drawerHtml);
    $(`#${id} .inline-drawer-content`).append($els);
    
    // 绑定点击折叠事件
    $(`#${id} .inline-drawer-toggle`).on('click', function() {
        $(this).find('.inline-drawer-icon').toggleClass('down up');
        $(this).next('.inline-drawer-content').slideToggle(200);
    });
}

// 辅助函数：解除折叠面板包装
function unwrapElements(id) {
    const $drawer = $(`#${id}`);
    if ($drawer.length === 0) return;
    const $content = $drawer.find('.inline-drawer-content').children();
    $drawer.before($content);
    $drawer.remove();
}

// DOM修改逻辑 (功能 5 & 6)
function updateDOM() {
    // 5. 预设界面折叠
    if (settings.collapsePreset) {
        wrapElements('ext_wrap_preset_1', 'OpenAI Config 1', $('#openai_settings > div:first-child'));
        wrapElements('ext_wrap_preset_2', 'OpenAI Config 2', $('#range_block_openai'));
    } else {
        unwrapElements('ext_wrap_preset_1');
        unwrapElements('ext_wrap_preset_2');
    }

    // 6. 用户设置界面折叠
    if (settings.collapseUser) {
        // 第一部分：字体和宽度 + 杂项Theme Toggles
        wrapElements('ext_wrap_user_1', 'UI 布局与外观设置', $('[name="FontBlurChatWidthBlock"], [name="themeToggles"]'));

        // 第二部分：UI-Customization 内部包裹（排除 CustomCSS-block）
        if ($('#ext_wrap_user_2').length === 0) {
            // 先将 CustomCSS-block 移出，避免被包裹
            $('#CustomCSS-block').insertAfter('#UI-Customization');
            wrapElements('ext_wrap_user_2', '角色控制与杂项设置', $('#UI-Customization > [name="CharacterHandlingToggles"], #UI-Customization > [name="MiscellaneousToggles"]'));
        }
    } else {
        unwrapElements('ext_wrap_user_1');
        if ($('#ext_wrap_user_2').length > 0) {
            unwrapElements('ext_wrap_user_2');
            // 将 CustomCSS-block 还原回原来的位置
            $('#CustomCSS-block').appendTo('[name="MiscellaneousToggles"]');
        }
    }
}

// 2. 禁止自动唤醒输入框逻辑
function setupAutoFocusInterceptor() {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    if (!textarea._originalFocus) {
        textarea._originalFocus = textarea.focus;
    }

    let isUserInteraction = false;
    textarea.addEventListener('mousedown', () => isUserInteraction = true);
    textarea.addEventListener('touchstart', () => isUserInteraction = true);
    textarea.addEventListener('blur', () => isUserInteraction = false);

    textarea.focus = function(...args) {
        if (settings.disableAutoFocus && !isUserInteraction) {
            return; // 拦截系统自动触发的 focus
        }
        return textarea._originalFocus.apply(this, args);
    };
}

// 构建扩展设置界面
function buildUI() {
    const uiHtml = `
    <div class="inline-drawer wide100p flexFlowColumn" id="ext_custom_ui_tweaks">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>✨ 定制化 UI 优化插件</b>
            <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
        </div>
        <div class="inline-drawer-content" style="display:none; padding:10px 0;">
            
            <!-- 功能 1 -->
            <div class="range-block" style="margin-bottom: 10px;">
                <label class="checkbox_label">
                    <input type="checkbox" id="ext_ui_fullscreen" ${settings.fullscreen ? 'checked' : ''}>
                    <span>1. 启用全屏模式</span>
                </label>
                <div id="ext_ui_fullscreen_sub" style="margin-left: 25px; margin-top: 10px; display: ${settings.fullscreen ? 'block' : 'none'};">
                    <div class="flex-container alignitemscenter" style="margin-bottom: 5px;">
                        <span class="flex1">1.1 底栏设置:</span>
                        <select id="ext_ui_bottom_bar" class="text_pole margin0 widthNatural">
                            <option value="theme" ${settings.fullscreenBottom === 'theme' ? 'selected' : ''}>沿用主题样式</option>
                            <option value="bottom" ${settings.fullscreenBottom === 'bottom' ? 'selected' : ''}>置底</option>
                        </select>
                    </div>
                    <label class="checkbox_label">
                        <input type="checkbox" id="ext_ui_reply_bar" ${settings.fullscreenReplyBar ? 'checked' : ''}>
                        <span>1.2 回复时显示底栏</span>
                    </label>
                </div>
            </div>

            <!-- 功能 2 -->
            <div class="range-block" style="margin-bottom: 10px;">
                <label class="checkbox_label" title="除非用户手动点击输入框，否则禁止系统自动激活输入框">
                    <input type="checkbox" id="ext_ui_autofocus" ${settings.disableAutoFocus ? 'checked' : ''}>
                    <span>2. 禁止自动唤醒输入框</span>
                </label>
            </div>

            <!-- 功能 3 -->
            <div class="range-block flex-container alignitemscenter" style="margin-bottom: 10px;">
                <span class="flex1">3. 输入时显示模式:</span>
                <select id="ext_ui_input_mode" class="text_pole margin0 widthNatural">
                    <option value="default" ${settings.inputMode === 'default' ? 'selected' : ''}>默认</option>
                    <option value="sendOnly" ${settings.inputMode === 'sendOnly' ? 'selected' : ''}>只显示发送键</option>
                    <option value="fullTop" ${settings.inputMode === 'fullTop' ? 'selected' : ''}>输入框占满上行</option>
                    <option value="fullBottom" ${settings.inputMode === 'fullBottom' ? 'selected' : ''}>输入框占满下行</option>
                </select>
            </div>

            <!-- 功能 4 -->
            <div class="range-block" style="margin-bottom: 10px;">
                <label class="checkbox_label">
                    <input type="checkbox" id="ext_ui_qr" ${settings.collapseQR ? 'checked' : ''}>
                    <span>4. 折叠 QR (快捷回复)</span>
                </label>
            </div>

            <!-- 功能 5 -->
            <div class="range-block" style="margin-bottom: 10px;">
                <label class="checkbox_label">
                    <input type="checkbox" id="ext_ui_preset" ${settings.collapsePreset ? 'checked' : ''}>
                    <span>5. 预设界面折叠</span>
                </label>
            </div>

            <!-- 功能 6 -->
            <div class="range-block">
                <label class="checkbox_label">
                    <input type="checkbox" id="ext_ui_user" ${settings.collapseUser ? 'checked' : ''}>
                    <span>6. 用户设置界面折叠</span>
                </label>
            </div>

        </div>
    </div>
    <hr>`;

    // 注入UI（在用户设置的主题颜色抽屉之前）
    const $target = $('div[name="themeElements"] > .inline-drawer').first();
    if ($('#ext_custom_ui_tweaks').length === 0) {
        $target.before(uiHtml);
    }

    // 绑定抽屉点击事件
    $('#ext_custom_ui_tweaks .inline-drawer-toggle').on('click', function() {
        $(this).find('.inline-drawer-icon').toggleClass('down up');
        $(this).next('.inline-drawer-content').slideToggle(200);
    });

    // 绑定各种设置变更事件
    $('#ext_ui_fullscreen').on('change', function() {
        settings.fullscreen = !!$(this).prop('checked');
        $('#ext_ui_fullscreen_sub').css('display', settings.fullscreen ? 'block' : 'none');
        saveAndApply();
    });
    $('#ext_ui_bottom_bar').on('change', function() {
        settings.fullscreenBottom = $(this).val();
        saveAndApply();
    });
    $('#ext_ui_reply_bar').on('change', function() {
        settings.fullscreenReplyBar = !!$(this).prop('checked');
        saveAndApply();
    });
    $('#ext_ui_autofocus').on('change', function() {
        settings.disableAutoFocus = !!$(this).prop('checked');
        saveAndApply();
    });
    $('#ext_ui_input_mode').on('change', function() {
        settings.inputMode = $(this).val();
        saveAndApply();
    });
    $('#ext_ui_qr').on('change', function() {
        settings.collapseQR = !!$(this).prop('checked');
        saveAndApply();
    });
    $('#ext_ui_preset').on('change', function() {
        settings.collapsePreset = !!$(this).prop('checked');
        saveAndApply();
    });
    $('#ext_ui_user').on('change', function() {
        settings.collapseUser = !!$(this).prop('checked');
        saveAndApply();
    });
}

function saveAndApply() {
    saveExtensionSettings(extensionName, settings);
    updateCSS();
    updateDOM();
}

// 扩展初始化入口
jQuery(async () => {
    // 载入保存的设置
    const savedSettings = await getExtensionSettings(extensionName);
    if (savedSettings) {
        Object.assign(settings, savedSettings);
    }

    // 构建界面
    buildUI();

    // 拦截 Focus 逻辑
    setupAutoFocusInterceptor();

    // 初始化运行：应用CSS和DOM变化
    updateCSS();
    updateDOM();
});
