import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "SillyTavern-Layout";

// 默认设置对象
const defaultSettings = {
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

// 刷新 CSS class
function updateBodyClasses() {
    $('body').toggleClass('te-fullscreen', Boolean(settings.fullscreen));
    $('body').toggleClass('te-bottom-bar', Boolean(settings.fullscreen && settings.bottomBar === 'bottom'));
    $('body').toggleClass('te-show-bar-reply', Boolean(settings.fullscreen && settings.showBarReply));
    
    $('body').removeClass('te-input-onlySend te-input-upper te-input-lower');
    if (settings.inputModeEnabled && settings.inputMode) {
        $('body').addClass(`te-input-${settings.inputMode}`);
    }

    $('body').toggleClass('te-collapse-qr', Boolean(settings.collapseQR));
    $('body').toggleClass('te-preset-edit-layout', Boolean(settings.presetEditLayout));
    $('body').toggleClass('te-collapse-user', Boolean(settings.collapseUser));
    $('body').toggleClass('te-world-info-layout', Boolean(settings.worldInfoLayout));
}

// 核心：基于 DOM 结构和 HTML 修改的操作函数
function doDOMManipulations() {
    // -----------------------------------------
    // 1. 世界书顶部：新建与选择按钮彻底互换 HTML 节点顺序
    // -----------------------------------------
    const wiContainer = $('#world_popup > div:nth-child(2)');
    if (wiContainer.length) {
        const btnCreate = wiContainer.find('#world_create_button');
        const btnSelect = wiContainer.find('#world_editor_select');
        const textOr = wiContainer.children('small').first();

        if (btnCreate.length && btnSelect.length && textOr.length) {
            if (settings.worldInfoLayout) {
                // 判断 Select 是否在最前方，不在才进行移动（防无限触发）
                if (btnSelect.index() !== 0) {
                    // prepend 会把元素按顺序插入到容器的最前方！不会跑去后面
                    wiContainer.prepend(btnSelect, textOr, btnCreate);
                }
                textOr.hide();
            } else {
                // 还原时：把 Create 重新挪回最前方
                if (btnCreate.index() !== 0) {
                    wiContainer.prepend(btnCreate, textOr, btnSelect);
                }
                textOr.show();
            }
        }
    }

    // -----------------------------------------
    // 2. 预设编辑页面：动态大容器包裹与自动分配内联样式
    // -----------------------------------------
    const presetForm = $('#completion_prompt_manager_popup_edit .completion_prompt_manager_popup_entry_form');
    if (presetForm.length) {
        if (settings.presetEditLayout) {
            if (!presetForm.find('#te-preset-header-wrap').length) {
                const containers = presetForm.children('.flex-container').slice(0, 2);
                
                containers.wrapAll('<div id="te-preset-header-wrap" style="display:flex; flex-wrap:wrap; gap:10px; width:100%;"></div>');
                containers.attr('style', 'display: contents !important;');
                
                containers.find('.completion_prompt_manager_popup_entry_form_control')
                          .not(':has(#completion_prompt_manager_popup_entry_form_name)')
                          .attr('style', 'flex: 1 1 0 !important; min-width: 0 !important;');
                
                containers.find('select, input').attr('style', 'width: 100% !important; min-width: 0 !important;');
            }
        } else {
            const wrap = $('#te-preset-header-wrap');
            if (wrap.length) {
                const containers = wrap.children('.flex-container');
                containers.removeAttr('style');
                containers.find('.completion_prompt_manager_popup_entry_form_control').removeAttr('style');
                containers.find('select, input').removeAttr('style');
                containers.unwrap();
            }
        }
    }

    // -----------------------------------------
    // 3. 世界书条目：三个功能按钮的容器包裹
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
}

// 防抖的全局监听器，捕获所有动态弹出的界面并立刻应用 HTML 修改
let domManipTimeout;
const domObserver = new MutationObserver(() => {
    clearTimeout(domManipTimeout);
    domManipTimeout = setTimeout(doDOMManipulations, 50);
});

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
        
        block1.before('<div id="te-placeholder-preset-1" style="display:none;"></div>');
        block2.before('<div id="te-placeholder-preset-2" style="display:none;"></div>');

        $('#te-placeholder-preset-1').before(wrapper);
        wrapper.find('.inline-drawer-content').append(block1).append(block2);
    } else {
        if (!$('#te-preset-wrapper').length) return;
        $('#te-placeholder-preset-1').replaceWith($('#range_block_openai'));
        $('#te-placeholder-preset-2').replaceWith($('#openai_settings > div').first());
        $('#te-preset-wrapper').remove();
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

// 禁止自动唤醒输入框的核心拦截逻辑
function setupFocusInterceptor() {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    
    const originalFocus = ta.focus;
    let isUserInteraction = false;
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
    const $target = $('div[name="themeElements"] > .inline-drawer.wide100p.flexFlowColumn').first();
    $target.before(uiHTML);

    // 默认全局注入预设提示词全屏展开按钮
    const promptContainer = $('#completion_prompt_manager_popup_edit > div > form > div.completion_prompt_manager_popup_entry_form_control > div.flex-container.alignItemsCenter').first();
    if (promptContainer.length && !$('#te_expand_preset_btn').length) {
        promptContainer.append('<i id="te_expand_preset_btn" class="editor_maximize fa-solid fa-maximize right_menu_button" data-for="completion_prompt_manager_popup_entry_form_prompt" title="全屏展开"></i>');
    }

    $('#te_fullscreen').prop('checked', settings.fullscreen);
    $('#te_show_bar_reply').prop('checked', settings.showBarReply);
    $('#te_prevent_autofocus').prop('checked', settings.preventAutofocus);
    $('#te_input_mode_enabled').prop('checked', settings.inputModeEnabled);
    $('#te_collapse_qr').prop('checked', settings.collapseQR);
    $('#te_collapse_preset').prop('checked', settings.collapsePreset);
    $('#te_preset_edit_layout').prop('checked', settings.presetEditLayout);
    $('#te_collapse_user').prop('checked', settings.collapseUser);
    $('#te_world_info_layout').prop('checked', settings.worldInfoLayout);

    $(`.te-radio-checkbox[data-group="bottomBar"][value="${settings.bottomBar}"]`).prop('checked', true);
    $(`.te-radio-checkbox[data-group="inputMode"][value="${settings.inputMode}"]`).prop('checked', true);

    if(settings.fullscreen) $('#te_fs_options').show();
    if(settings.inputModeEnabled) $('#te_input_options').show();

    // 初始化方法
    updateBodyClasses();
    togglePresetCollapse(settings.collapsePreset);
    toggleUserCollapse(settings.collapseUser);
    setupFocusInterceptor();
    doDOMManipulations();

    // 挂载全局 DOM 监听
    domObserver.observe(document.body, { childList: true, subtree: true });

    // ---------------- 事件绑定 ----------------
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

    $('#te_preset_edit_layout').on('change', function() {
        settings.presetEditLayout = $(this).is(':checked');
        updateBodyClasses();
        doDOMManipulations();
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
});
