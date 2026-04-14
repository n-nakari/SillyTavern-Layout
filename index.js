import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "SillyTavern-Layout";

// 初始化默认设置
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {
        fullscreen: false,
        bottomBar: 'bottom', // 默认勾选置底
        showBarReply: false,
        preventAutofocus: false,
        inputModeEnabled: false,
        inputMode: 'onlySend', // 默认选中一项，避免空白
        collapseQR: false,
        collapsePreset: false,
        presetEditLayout: false, // 预设编辑界面布局修改
        collapseUser: false,
        worldInfoLayout: false
    };
}

const settings = extension_settings[extensionName];

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
            <div class="flex-container alignitemscenter">
                <span class="te-setting-title">底栏位置 :</span>
                <label class="checkbox_label">
                    <input type="checkbox" class="te-radio-checkbox" data-group="bottomBar" value="bottom">
                    <span>置底</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" class="te-radio-checkbox" data-group="bottomBar" value="default">
                    <span>沿用主题样式</span>
                </label>
            </div>
            <label class="checkbox_label">
                <input type="checkbox" id="te_show_bar_reply" />
                <span>AI回复时显示底栏</span>
            </label>
        </div>
        
        <label class="checkbox_label">
            <input type="checkbox" id="te_prevent_autofocus" />
            <span>禁止自动激活输入框</span>
        </label>
        
        <div class="flex-container flexFlowColumn">
            <label class="checkbox_label">
                <input type="checkbox" id="te_input_mode_enabled" />
                <span>输入时输入框布局</span>
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
            <input type="checkbox" id="te_preset_edit_layout" />
            <span>预设编辑界面布局修改</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_collapse_user" />
            <span>用户设置界面折叠</span>
        </label>

        <label class="checkbox_label">
            <input type="checkbox" id="te_world_info_layout" />
            <span>世界书布局修改</span>
        </label>
    </div>
</div>
`;

// 刷新 CSS class 的方法
function updateBodyClasses() {
    $('body').toggleClass('te-fullscreen', settings.fullscreen);
    $('body').toggleClass('te-bottom-bar', settings.fullscreen && settings.bottomBar === 'bottom');
    $('body').toggleClass('te-show-bar-reply', settings.fullscreen && settings.showBarReply);
    
    $('body').removeClass('te-input-onlySend te-input-upper te-input-lower');
    if (settings.inputModeEnabled && settings.inputMode) {
        $('body').addClass(`te-input-${settings.inputMode}`);
    }

    $('body').toggleClass('te-collapse-qr', settings.collapseQR);
    $('body').toggleClass('te-preset-edit-layout', settings.presetEditLayout);
    $('body').toggleClass('te-collapse-user', settings.collapseUser);
    $('body').toggleClass('te-world-info-layout', settings.worldInfoLayout);
}

// 预设界面折叠处理函数
function togglePresetCollapse(enable) {
    if (enable) {
        if ($('#te-preset-wrapper').length) return;
        const wrapper = $(`
            <div id="te-preset-wrapper" class="inline-drawer wide100p flexFlowColumn">
                <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
                    <b><span>预设设置</span></b>
                    <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                </div>
                <div class="inline-drawer-content" style="display:none;"></div>
            </div>
        `);
        
        const block1 = $('#range_block_openai');
        const block2 = $('#openai_settings > div').first();
        
        // 插入占位符
        block1.before('<div id="te-placeholder-preset-1" style="display:none;"></div>');
        block2.before('<div id="te-placeholder-preset-2" style="display:none;"></div>');

        // 把包裹外壳插入到预设1的占位符前方
        $('#te-placeholder-preset-1').before(wrapper);
        
        // 严格按照顺序注入元素
        wrapper.find('.inline-drawer-content').append(block1).append(block2);
    } else {
        if (!$('#te-preset-wrapper').length) return;
        
        // 通过占位符精准归位
        $('#te-placeholder-preset-1').replaceWith($('#range_block_openai'));
        $('#te-placeholder-preset-2').replaceWith($('#openai_settings > div').first());
        $('#te-preset-wrapper').remove();
    }
}

// 用户设置界面重排及折叠处理函数
function toggleUserCollapse(enable) {
    if (enable) {
        // 第一部分：字体/宽度 和 Toggles 合并为“界面效果”
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
            
            // 打桩保护位置
            fontBlock.before('<div id="te-placeholder-font" style="display:none;"></div>');
            toggleBlock.before('<div id="te-placeholder-toggle" style="display:none;"></div>');
            
            wrap1.find('.inline-drawer-content').append(fontBlock).append(toggleBlock);

            // 将 wrap1 插入到插件面板前方，自然形成顺序: 界面效果 -> 布局优化 -> 主题颜色
            $('#te-settings-drawer').before(wrap1);
        }

        // 第二部分：角色处理、杂项与CSS模块的解构迁移
        if (!$('#te-placeholder-char').length) {
            const charHandling = $('div[name="CharacterHandlingToggles"]');
            const miscToggles = $('div[name="MiscellaneousToggles"]');
            const customCss = $('#CustomCSS-block');
            const chatHandling = $('div[name="ChatMessageHandlingToggles"]');

            // 打桩保护位置
            charHandling.before('<div id="te-placeholder-char" style="display:none;"></div>');
            miscToggles.before('<div id="te-placeholder-misc" style="display:none;"></div>');
            customCss.before('<div id="te-placeholder-css" style="display:none;"></div>');

            // 迁移至：CustomCSS 正下方、聊天/消息处理正上方
            chatHandling.before(customCss);
            chatHandling.before(charHandling);
            chatHandling.before(miscToggles);

            // 隐藏出现布局异常的空容器
            $('#UI-Customization').hide();
        }

    } else {
        // 还原第一部分（界面效果）
        if ($('#te-user-wrapper-1').length) {
            $('#te-placeholder-font').replaceWith($('div[name="FontBlurChatWidthBlock"]'));
            $('#te-placeholder-toggle').replaceWith($('div[name="themeToggles"]'));
            $('#te-user-wrapper-1').remove();
        }

        // 还原第二部分（解构迁移复位）
        if ($('#te-placeholder-char').length) {
            $('#te-placeholder-char').replaceWith($('div[name="CharacterHandlingToggles"]'));
            $('#te-placeholder-misc').replaceWith($('div[name="MiscellaneousToggles"]'));
            $('#te-placeholder-css').replaceWith($('#CustomCSS-block'));
            
            // 恢复容器显示
            $('#UI-Customization').show();
        }
    }
}

// 禁止自动唤醒输入框的核心拦截逻辑
function setupFocusInterceptor() {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    
    const originalFocus = ta.focus;
    let isUserInteraction = false;

    // 记录用户的真实交互行为
    $(ta).on('mousedown touchstart keydown', () => { isUserInteraction = true; });
    
    ta.focus = function(options) {
        if (settings.preventAutofocus && !isUserInteraction) {
            return;
        }
        originalFocus.call(this, options);
        isUserInteraction = false; 
    };
}

// 初始化插件
jQuery(async () => {
    // 注入UI
    // 定位到原生的 Theme Colors 抽屉上方
    const $target = $('div[name="themeElements"] > .inline-drawer.wide100p.flexFlowColumn').first();
    $target.before(uiHTML);

    // 默认全局注入预设提示词全屏展开按钮（无需设置项）
    const promptContainer = $('#completion_prompt_manager_popup_edit > div > form > div.completion_prompt_manager_popup_entry_form_control > div.flex-container.alignItemsCenter').first();
    if (promptContainer.length && !$('#te_expand_preset_btn').length) {
        promptContainer.append('<i id="te_expand_preset_btn" class="editor_maximize fa-solid fa-maximize right_menu_button" data-for="completion_prompt_manager_popup_entry_form_prompt" title="全屏展开"></i>');
    }

    // 还原普通的Checkbox状态到UI
    $('#te_fullscreen').prop('checked', settings.fullscreen);
    $('#te_show_bar_reply').prop('checked', settings.showBarReply);
    $('#te_prevent_autofocus').prop('checked', settings.preventAutofocus);
    $('#te_input_mode_enabled').prop('checked', settings.inputModeEnabled);
    $('#te_collapse_qr').prop('checked', settings.collapseQR);
    $('#te_collapse_preset').prop('checked', settings.collapsePreset);
    $('#te_preset_edit_layout').prop('checked', settings.presetEditLayout);
    $('#te_collapse_user').prop('checked', settings.collapseUser);
    $('#te_world_info_layout').prop('checked', settings.worldInfoLayout);

    // 还原"单选Checkbox"状态
    $(`.te-radio-checkbox[data-group="bottomBar"][value="${settings.bottomBar}"]`).prop('checked', true);
    $(`.te-radio-checkbox[data-group="inputMode"][value="${settings.inputMode}"]`).prop('checked', true);

    // 初始化子界面的显示/隐藏
    if(settings.fullscreen) $('#te_fs_options').show();
    if(settings.inputModeEnabled) $('#te_input_options').show();

    // 应用初始逻辑
    updateBodyClasses();
    togglePresetCollapse(settings.collapsePreset);
    toggleUserCollapse(settings.collapseUser);
    setupFocusInterceptor();

    // ---------------- 事件绑定 ----------------

    // 将特定类别的Checkbox化作单选按钮逻辑
    $('.te-radio-checkbox').on('change', function() {
        if ($(this).is(':checked')) {
            const group = $(this).data('group');
            // 将同组内其它checkbox关掉
            $(`.te-radio-checkbox[data-group="${group}"]`).not(this).prop('checked', false);
            
            settings[group] = $(this).val();
            updateBodyClasses();
            saveSettingsDebounced();
        } else {
            // 禁止主动取消勾选（以保持单选特性，必有一项被选中）
            $(this).prop('checked', true);
        }
    });

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

    $('#te_show_bar_reply').on('change', function() {
        settings.showBarReply = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_prevent_autofocus').on('change', function() {
        settings.preventAutofocus = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $('#te_input_mode_enabled').on('change', function() {
        settings.inputModeEnabled = $(this).is(':checked');
        if(settings.inputModeEnabled) {
            $('#te_input_options').slideDown(200);
        } else {
            $('#te_input_options').slideUp(200);
        }
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

    $('#te_preset_edit_layout').on('change', function() {
        settings.presetEditLayout = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });

    $('#te_collapse_user').on('change', function() {
        settings.collapseUser = $(this).is(':checked');
        toggleUserCollapse(settings.collapseUser);
        updateBodyClasses(); // 用于挂载超宽修复CSS的包裹类
        saveSettingsDebounced();
    });

    $('#te_world_info_layout').on('change', function() {
        settings.worldInfoLayout = $(this).is(':checked');
        updateBodyClasses();
        saveSettingsDebounced();
    });
});
