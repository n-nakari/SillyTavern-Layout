import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "SillyTavern-Layout";

// 初始化默认设置
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {
        fullscreen: false,
        bottomBar: 'default',
        showBarReply: false,
        preventAutofocus: false,
        inputMode: 'none',
        collapseQR: false,
        collapsePreset: false,
        collapseUser: false
    };
}

const settings = extension_settings[extensionName];

// 插件的UI HTML
const uiHTML = `
<div class="inline-drawer wide100p flexFlowColumn" id="te-settings-drawer">
    <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
        <b><span>主题外观拓展 (Theme Editor)</span></b>
        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
    </div>
    <div class="inline-drawer-content" style="display: none;">
        
        <label class="checkbox_label">
            <input type="checkbox" id="te_fullscreen" />
            <span>1. 启用全屏模式</span>
        </label>
        
        <div id="te_fs_options" style="margin-left: 20px; border-left: 2px solid var(--SmartThemeBorderColor); padding-left: 10px; display: none;">
            <div class="flex-container alignitemscenter" style="margin-bottom: 5px;">
                <span style="font-size: 0.9em; margin-right: 10px;">1.1 底栏设置:</span>
                <label><input type="radio" name="te_bottom_bar" value="bottom"> 置底</label>
                <label><input type="radio" name="te_bottom_bar" value="default"> 沿用主题样式</label>
            </div>
            <label class="checkbox_label">
                <input type="checkbox" id="te_show_bar_reply" />
                <span>1.2 回复时显示底栏</span>
            </label>
        </div>
        <hr>
        
        <label class="checkbox_label">
            <input type="checkbox" id="te_prevent_autofocus" />
            <span>2. 禁止自动唤醒输入框</span>
        </label>
        <hr>
        
        <div class="flex-container flexFlowColumn">
            <span style="font-size: 0.9em; margin-bottom: 5px;">3. 输入时界面变化:</span>
            <div class="flex-container flexFlowColumn" style="margin-left: 20px; border-left: 2px solid var(--SmartThemeBorderColor); padding-left: 10px;">
                <label><input type="radio" name="te_input_mode" value="none"> 无</label>
                <label><input type="radio" name="te_input_mode" value="onlySend"> 3.1 只显示发送键</label>
                <label><input type="radio" name="te_input_mode" value="upper"> 3.2 输入框占满上行</label>
                <label><input type="radio" name="te_input_mode" value="lower"> 3.3 输入框占满下行</label>
            </div>
        </div>
        <hr>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_qr" />
            <span>4. 折叠QR (快速回复)</span>
        </label>
        <hr>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_preset" />
            <span>5. 预设界面折叠</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_user" />
            <span>6. 用户设置界面折叠</span>
        </label>
    </div>
</div>
`;

// 绑定SillyTavern风格的折叠面板点击事件
function bindDrawerEvent($drawer) {
    $drawer.find('.inline-drawer-toggle').first().on('click', function () {
        const content = $(this).next('.inline-drawer-content');
        const icon = $(this).find('.inline-drawer-icon');
        content.slideToggle(200);
        icon.toggleClass('down up');
        icon.toggleClass('fa-circle-chevron-down fa-circle-chevron-up');
    });
}

// 刷新 CSS class 的方法
function updateBodyClasses() {
    $('body').toggleClass('te-fullscreen', settings.fullscreen);
    $('body').toggleClass('te-bottom-bar', settings.fullscreen && settings.bottomBar === 'bottom');
    $('body').toggleClass('te-show-bar-reply', settings.fullscreen && settings.showBarReply);
    
    $('body').removeClass('te-input-onlySend te-input-upper te-input-lower');
    if (settings.inputMode !== 'none') {
        $('body').addClass(`te-input-${settings.inputMode}`);
    }

    $('body').toggleClass('te-collapse-qr', settings.collapseQR);
}

// 5. 预设界面折叠处理函数
function togglePresetCollapse(enable) {
    if (enable) {
        if ($('#te-preset-wrapper').length) return;
        const wrapper = $(`
            <div id="te-preset-wrapper" class="inline-drawer wide100p flexFlowColumn">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b><span>OpenAI 设置 / 预设</span></b>
                    <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                </div>
                <div class="inline-drawer-content" style="display:none;"></div>
            </div>
        `);
        $('#range_block_openai').before(wrapper);
        wrapper.find('.inline-drawer-content').append($('#openai_settings > div:first-child'));
        wrapper.find('.inline-drawer-content').append($('#range_block_openai'));
        bindDrawerEvent(wrapper);
    } else {
        if (!$('#te-preset-wrapper').length) return;
        $('#te-preset-wrapper').before($('#te-preset-wrapper .inline-drawer-content > div:first-child'));
        $('#te-preset-wrapper').before($('#range_block_openai'));
        $('#te-preset-wrapper').remove();
    }
}

// 6. 用户设置界面折叠处理函数
function toggleUserCollapse(enable) {
    if (enable) {
        // 第一部分：字体/宽度 和 Toggles 合并
        if (!$('#te-user-wrapper-1').length) {
            const wrap1 = $(`
                <div id="te-user-wrapper-1" class="inline-drawer wide100p flexFlowColumn">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b><span>界面布局与特效 (UI Layout & Effects)</span></b>
                        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;"></div>
                </div>
            `);
            const fontBlock = $('div[name="FontBlurChatWidthBlock"]');
            const toggleBlock = $('div[name="themeToggles"]');
            fontBlock.before(wrap1);
            wrap1.find('.inline-drawer-content').append(fontBlock).append(toggleBlock);
            bindDrawerEvent(wrap1);
        }

        // 第二部分：角色处理 和 杂项 合并（但不包含 CustomCSS）
        if (!$('#te-user-wrapper-2').length) {
            const wrap2 = $(`
                <div id="te-user-wrapper-2" class="inline-drawer wide100p flexFlowColumn">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b><span>功能首选项 (Features Customization)</span></b>
                        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;"></div>
                </div>
            `);
            const charHandling = $('div[name="CharacterHandlingToggles"]');
            const miscToggles = $('div[name="MiscellaneousToggles"]');
            const customCss = $('#CustomCSS-block');
            
            charHandling.before(wrap2);
            wrap2.find('.inline-drawer-content').append(charHandling).append(miscToggles);
            // 把 CustomCSS 挪出来，放在 wrap2 下方
            wrap2.after(customCss);
            bindDrawerEvent(wrap2);
        }
    } else {
        if ($('#te-user-wrapper-1').length) {
            const wrap1 = $('#te-user-wrapper-1');
            wrap1.before(wrap1.find('div[name="FontBlurChatWidthBlock"]'));
            wrap1.before(wrap1.find('div[name="themeToggles"]'));
            wrap1.remove();
        }

        if ($('#te-user-wrapper-2').length) {
            const wrap2 = $('#te-user-wrapper-2');
            const miscToggles = wrap2.find('div[name="MiscellaneousToggles"]');
            wrap2.before(wrap2.find('div[name="CharacterHandlingToggles"]'));
            wrap2.before(miscToggles);
            // 恢复 CustomCSS 放回 MiscellaneousToggles
            miscToggles.append($('#CustomCSS-block'));
            wrap2.remove();
        }
    }
}

// 2. 禁止自动唤醒输入框的核心拦截逻辑
function setupFocusInterceptor() {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    
    const originalFocus = ta.focus;
    let isUserInteraction = false;

    // 记录用户的真实交互行为
    $(ta).on('mousedown touchstart keydown', () => { isUserInteraction = true; });
    
    ta.focus = function(options) {
        if (settings.preventAutofocus && !isUserInteraction) {
            // 如果开启了防唤醒，且并非来自用户的点击/输入操作，则拒绝执行focus
            return;
        }
        originalFocus.call(this, options);
        isUserInteraction = false; // 成功focus后重置状态
    };
}

// 初始化插件
jQuery(async () => {
    // 注入UI
    // 找到 Theme Colors 那个 drawer 的正上方
    const $target = $('div[name="themeElements"] > .inline-drawer.wide100p.flexFlowColumn').first();
    $target.before(uiHTML);

    const $drawer = $('#te-settings-drawer');
    bindDrawerEvent($drawer);

    // 还原设置状态到UI
    $('#te_fullscreen').prop('checked', settings.fullscreen);
    $(`input[name="te_bottom_bar"][value="${settings.bottomBar}"]`).prop('checked', true);
    $('#te_show_bar_reply').prop('checked', settings.showBarReply);
    $('#te_prevent_autofocus').prop('checked', settings.preventAutofocus);
    $(`input[name="te_input_mode"][value="${settings.inputMode}"]`).prop('checked', true);
    $('#te_collapse_qr').prop('checked', settings.collapseQR);
    $('#te_collapse_preset').prop('checked', settings.collapsePreset);
    $('#te_collapse_user').prop('checked', settings.collapseUser);

    // 显示或隐藏1.x的子选项
    if(settings.fullscreen) $('#te_fs_options').slideDown(200);

    // 应用初始逻辑
    updateBodyClasses();
    togglePresetCollapse(settings.collapsePreset);
    toggleUserCollapse(settings.collapseUser);
    setupFocusInterceptor();

    // 绑定事件处理器
    $('#te_fullscreen').on('change', function() {
        settings.fullscreen = $(this).is(':checked');
        if(settings.fullscreen) {
            $('#te_fs_options').slideDown(200);
        } else {
            $('#te_fs_options').slideUp(200);
        }
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('input[name="te_bottom_bar"]').on('change', function() {
        settings.bottomBar = $(this).val();
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_show_bar_reply').on('change', function() {
        settings.showBarReply = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_prevent_autofocus').on('change', function() {
        settings.preventAutofocus = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $('input[name="te_input_mode"]').on('change', function() {
        settings.inputMode = $(this).val();
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
        saveSettingsDebounced();
    });
});
