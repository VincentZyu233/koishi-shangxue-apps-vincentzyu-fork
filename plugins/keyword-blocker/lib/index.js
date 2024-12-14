"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const koishi = require("koishi");
const { Schema, Logger, h } = require("koishi");
const logger = new Logger('keyword-blocker');

const inject = ["database"];
const name = "keyword-blocker";

const Config = Schema.intersect([
  Schema.object({
    command_authority: Schema.number().default(3).description('允许使用指令的权限等级'),
    blockCommand: Schema.string().default("添加屏蔽词").description("添加屏蔽词指令名"),
    unblockCommand: Schema.string().default("取消屏蔽词").description("取消屏蔽词指令名"),
    global_blockCommand: Schema.string().default("全局添加屏蔽词").description("添加全局屏蔽词指令名"),
    global_unblockCommand: Schema.string().default("全局取消屏蔽词").description("取消全局屏蔽词指令名"),
    blockUser: Schema.string().default("拉黑用户").description("添加黑名单的指令"),
    unblockUser: Schema.string().default("取消拉黑用户").description("取消黑名单的指令"),
    global_blockUser: Schema.string().default("全局拉黑用户").description("添加全局黑名单的指令"),
    global_unblockUser: Schema.string().default("全局取消拉黑用户").description("取消全局黑名单的指令"),
    blockChannel: Schema.string().default("拉黑频道").description("添加黑名单频道的指令"),
    unblockChannel: Schema.string().default("取消拉黑频道").description("取消黑名单频道的指令"),
  }).description('指令设置'),

  Schema.object({
    self_operation: Schema.boolean().default(true).description('允许对 自己/当前频道 对自己进行 拉黑/取消拉黑 操作'),
    Allow_trigger: Schema.boolean().default(false).description('允许 拉黑的用户/频道 触发本插件的指令'),
    autoblockChannel: Schema.boolean().default(false).description('自动全部频道都加入黑名单<br>`会在数据库中没有该频道的记录时，首次接受消息后自动屏蔽（首次可能触发指令）`'),
  }).description('频道操作设置'),

  Schema.object({
    /*
    过滤器可以精细地设置某个插件的过滤
    但是不能精细过滤某个指令的过滤（一个插件可能会有多个指令，但是只想要其中一个指令）

    于是就有了这个喵~
    */
    command_userId_list: Schema.array(Schema.object({
      command: Schema.string().description('指令名称'),
      userId: Schema.string().description('应用对象'),
      enableobject: Schema.union([
        Schema.const('用户ID'),
        Schema.const('频道ID'),
        Schema.const('平台名称'),
      ]).description('应用对象属性').default('用户ID'),
      enable: Schema.union([
        Schema.const('取消应用'),
        Schema.const('白名单'),
        Schema.const('黑名单'),
      ]).description('应用方法').default('黑名单'),
    })).role('table').description('【指令-用户】黑白名单<br>左侧填写指令，右侧填写用户ID <br>➣ 注意需要加上指令前缀（如果有）<br>黑名单：仅屏蔽此对象<br>白名单：仅允许此对象<br>取消应用：该行不生效<br>> 逻辑优先级按照下表降序排序。[详细说明见readme](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/keyword-blocker)<br>').default(
      [
        {
          "command": "++help",
          "userId": "114514",
          "enableobject": null,
          "enable": "白名单"
        },
        {
          "command": "++help",
          "userId": "1919810",
          "enable": null,
          "enableobject": "频道ID"
        },
        {
          "command": "++help",
          "userId": "private:114514",
          "enable": "黑名单",
          "enableobject": "频道ID"
        },
        {
          "command": "/help",
          "userId": "qq",
          "enable": null,
          "enableobject": "平台名称"
        }
      ]
    ),
    /*
    为了快速实现【对某个频道仅允许使用指定指令】的情况 就有了这个配置项
    */
    command_channelId_list: Schema.array(Schema.object({
      channelId: Schema.string().description('应用的频道'),
      command: Schema.string().description('允许调用的指令'),
    })).role('table').description('快速实现【对某个频道仅允许使用指定指令】<br> 相当于指定 在某个频道内允许触发的指令').default(
      [
        {
          "channelId": "1919810",
          "command": "status"
        },
        {
          "channelId": "private:114514",
          "command": "status"
        }
      ]
    ),
  }).description('指令控制设置'),

  Schema.object({
    enable_prohibitedKeywords: Schema.boolean().description("启用输出内容屏蔽").default(false),
    prohibitedKeywords: Schema.array(Schema.object({
      keywordContent: Schema.string().description("关键词内容，包含这些关键词的任意一项，就会取消本次内容的输出"),
      isRegex: Schema.boolean().description("是否使用了正则表达式，开启后使用，正则表达生效，否则当做字符串处理"),
    })).role('table').description("禁止输出的关键词。支持正则表达式。包含这些关键词的任意其中一项，就会取消这次消息的返回。").default([
      {
        "isRegex": true,
        "keywordContent": "/^你好.*$/"
      },
      {
        "keywordContent": "我是机器人",
        "isRegex": false
      }
    ]),
  }).description('输出内容屏蔽设置'),

  Schema.object({
    //removeLeadingBrackets: Schema.boolean().default(true).description('移除接收到的尖括号内容，比如at元素（仅推荐qq平台使用）'),
    loggerinfo: Schema.boolean().default(false).description('日志调试模式'),
  }).description('调试设置'),
]);

const usage = `
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>使用说明</title>
</head>
<body>
<p>让你的机器人可以屏蔽和取消屏蔽关键词及用户\~</p>
<p>旨在在某些群里屏蔽掉一些特定指令或用户</p>
<p>你可以在数据库的 <code>blockedKeywords</code> 表里看到已经添加的屏蔽词和黑名单用户，并且如果有需要，可以手动操作数据库哦</p>
<p>需要注意的是，添加关键词来屏蔽指令，请带上对应的指令前缀（如果有）</p>
<h3>指令列表：</h3>
<details>
<summary>点击查看使用说明</summary>
<ol>
<li><strong>添加屏蔽词</strong>
<ul>
<li>指令：<code>添加屏蔽词 &lt;关键词&gt;</code></li>
<li>描述：将指定关键词添加到当前群的屏蔽列表中。可以用于在某个群屏蔽某个指令。</li>
<li>示例：<code>添加屏蔽词 spam</code></li>
</ul>
</li>
<li><strong>取消屏蔽词</strong>
<ul>
<li>指令：<code>取消屏蔽词 &lt;关键词&gt;</code></li>
<li>描述：将指定关键词从当前群的屏蔽列表中移除。</li>
<li>示例：<code>取消屏蔽词 spam</code></li>
</ul>
</li>
<li><strong>全局添加屏蔽词</strong>
<ul>
<li>指令：<code>全局添加屏蔽词 &lt;关键词&gt;</code></li>
<li>描述：将指定关键词添加到全局屏蔽列表中，所有群均生效。可以用于屏蔽某个指令。</li>
<li>示例：<code>全局添加屏蔽词 spam</code></li>
</ul>
</li>
<li><strong>全局取消屏蔽词</strong>
<ul>
<li>指令：<code>全局取消屏蔽词 &lt;关键词&gt;</code></li>
<li>描述：将指定关键词从全局屏蔽列表中移除。</li>
<li>示例：<code>全局取消屏蔽词 spam</code></li>
</ul>
</li>
<li><strong>拉黑用户</strong>
<ul>
<li>指令：<code>拉黑用户 &lt;用户ID&gt;</code></li>
<li>描述：将指定用户添加到当前群的黑名单中。可以用于在某个群屏蔽某个用户。</li>
<li>示例：<code>拉黑用户 123456</code></li>
</ul>
</li>
<li><strong>取消拉黑用户</strong>
<ul>
<li>指令：<code>取消拉黑用户 &lt;用户ID&gt;</code></li>
<li>描述：将指定用户从当前群的黑名单中移除。</li>
<li>注意：不允许对自己操作。</li>
<li>示例：<code>取消拉黑用户 123456</code></li>
</ul>
</li>
<li><strong>全局拉黑用户</strong>
<ul>
<li>指令：<code>全局拉黑用户 &lt;用户ID&gt;</code></li>
<li>描述：将指定用户添加到全局黑名单中，所有群均生效。可以用于屏蔽某个用户。</li>
<li>示例：<code>全局拉黑用户 123456</code></li>
</ul>
</li>
<li><strong>全局取消拉黑用户</strong>
<ul>
<li>指令：<code>全局取消拉黑用户 &lt;用户ID&gt;</code></li>
<li>描述：将指定用户从全局黑名单中移除。</li>
<li>示例：<code>全局取消拉黑用户 123456</code></li>
</ul>
</li>
<li><strong>拉黑频道</strong>
<ul>
<li>指令：<code>拉黑频道 &lt;频道ID&gt;</code></li>
<li>描述：将指定频道添加到黑名单中。</li>
<li>示例：<code>拉黑频道 123456</code></li>
</ul>
</li>
<li><strong>取消拉黑频道</strong>
<ul>
<li>指令：<code>取消拉黑频道 &lt;频道ID&gt;</code></li>
<li>描述：将指定频道从黑名单中移除。</li>
<li>示例：<code>取消拉黑频道 123456</code></li>
</ul>
</li>
</ol>
<h3>注意事项：</h3>
<ul>
<li>屏蔽词和黑名单用户信息保存在数据库的 <code>blockedKeywords</code> 表中。</li>
<li>在使用取消屏蔽词或取消拉黑用户指令时，确保提供的关键词或用户ID是有效的。</li>
<li>在koishi控制台可以手动操作数据库以管理屏蔽词和黑名单用户。</li>
</ul>
<h3>日志调试模式：</h3>
<ul>
<li>配置项 <code>loggerinfo</code> 可以启用日志调试模式，用于记录屏蔽操作的详细信息。</li>
<li>启用方法：在配置文件中将 <code>loggerinfo</code> 设置为 <code>开启</code>，然后插件右上角重载。</li>
</ul>
</details>
</body>
</html>

`;

async function apply(ctx, config) {
  ctx.model.extend("blockedKeywords", {
    platform: "string",
    channelId: "string",
    blockedkeywords: "list",
    blockedusers: "list",
    isblockedchannel: "boolean"
  }, {
    primary: ["platform", "channelId"]
  });


  const zh_CN_default = {
    commands: {
      [config.blockCommand]: {
        description: `添加屏蔽词`,
        messages: {
          "no_Valid_Keyword": "请提供一个有效的关键词。",
          "keyword_Already_Blocked": "关键词 \"{keyword}\" 已在屏蔽列表中。",
          "keyword_Added": "关键词 \"{keyword}\" 已添加到屏蔽列表。",
        }
      },
      [config.unblockCommand]: {
        description: `取消屏蔽词`,
        messages: {
          "no_Valid_Keyword": "请提供一个有效的关键词。",
          "keyword_Not_Blocked": "关键词 \"{keyword}\" 不在屏蔽列表中。",
          "keyword_Removed": "关键词 \"{keyword}\" 已从屏蔽列表中移除。",
        }
      },
      [config.global_blockCommand]: {
        description: `全局添加屏蔽词`,
        messages: {
          "no_Valid_Keyword": "请提供一个有效的关键词。",
          "keyword_Already_Blocked": "关键词 \"{keyword}\" 已在全局屏蔽列表中。",
          "keyword_Added": "关键词 \"{keyword}\" 已添加到全局屏蔽列表。",
        }
      },
      [config.global_unblockCommand]: {
        description: `全局取消屏蔽词`,
        messages: {
          "no_Valid_Keyword": "请提供一个有效的关键词。",
          "keyword_Not_Blocked": "关键词 \"{keyword}\" 不在全局屏蔽列表中。",
          "keyword_Removed": "关键词 \"{keyword}\" 已从全局屏蔽列表中移除。",
        }
      },
      [config.blockUser]: {
        description: `拉黑用户`,
        messages: {
          "no_Valid_UserId": "请提供一个有效的用户ID。",
          "user_Already_Blocked": "用户ID \"{userId}\" 已在黑名单中。",
          "user_Added": "用户ID \"{userId}\" 已添加到黑名单中。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      },
      [config.unblockUser]: {
        description: `取消拉黑用户`,
        messages: {
          "no_Valid_UserId": "请提供一个有效的用户ID。",
          "user_Not_Blocked": "用户ID \"{userId}\" 不在黑名单中。",
          "user_Removed": "用户ID \"{userId}\" 已从黑名单中移除。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      },
      [config.global_blockUser]: {
        description: `全局拉黑用户`,
        messages: {
          "no_Valid_UserId": "请提供一个有效的用户ID。",
          "user_Already_Blocked": "用户ID \"{userId}\" 已在全局黑名单中。",
          "user_Added": "用户ID \"{userId}\" 已添加到全局黑名单中。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      },
      [config.global_unblockUser]: {
        description: `全局取消拉黑用户`,
        messages: {
          "no_Valid_UserId": "请提供一个有效的用户ID。",
          "user_Not_Blocked": "用户ID \"{userId}\" 不在全局黑名单中。",
          "user_Removed": "用户ID \"{userId}\" 已从全局黑名单中移除。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      },
      [config.blockChannel]: {
        description: `拉黑频道`,
        messages: {
          "no_Valid_ChannelId": "请提供一个有效的频道ID。",
          "channel_Already_Blocked": "频道ID \"{channelId}\" 已在黑名单中。",
          "channel_Added": "频道ID \"{channelId}\" 已添加到黑名单中。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      },
      [config.unblockChannel]: {
        description: `取消拉黑频道`,
        messages: {
          "no_Valid_ChannelId": "请提供一个有效的频道ID。",
          "channel_Not_Blocked": "频道ID \"{channelId}\" 不在黑名单中。",
          "channel_Removed": "频道ID \"{channelId}\" 已从黑名单中移除。",
          "cannot_block_Self": "不允许对自己操作。",
        }
      }
    }
  };

  ctx.i18n.define("zh-CN", zh_CN_default);

  function logInfo(message) {
    if (config.loggerinfo) {
      logger.info(message);
    }
  }
  async function addKeyword(session, keyword, isGlobal = false) {
    if (!keyword) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockCommand : config.blockCommand) + '.messages.no_Valid_Keyword')));
      return;
    }

    const channelId = isGlobal ? 'global' : session.channelId;
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0) {
      await ctx.database.create("blockedKeywords", { platform: session.platform, channelId, blockedkeywords: [keyword], blockedusers: [] });
    } else {
      const keywords = record[0].blockedkeywords;
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
        await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { blockedkeywords: keywords });
      } else {
        await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockCommand : config.blockCommand) + '.messages.keyword_Already_Blocked', { keyword })));
        return;
      }
    }
    await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockCommand : config.blockCommand) + '.messages.keyword_Added', { keyword })));
  }

  async function removeKeyword(session, keyword, isGlobal = false) {
    if (!keyword) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockCommand : config.unblockCommand) + '.messages.no_Valid_Keyword')));
      return;
    }

    const channelId = isGlobal ? 'global' : session.channelId;
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0 || !record[0].blockedkeywords.includes(keyword)) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockCommand : config.unblockCommand) + '.messages.keyword_Not_Blocked', { keyword })));
      return;
    } else {
      const keywords = record[0].blockedkeywords.filter(k => k !== keyword);
      await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { blockedkeywords: keywords });
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockCommand : config.unblockCommand) + '.messages.keyword_Removed', { keyword })));
    }
  }

  async function addUser(session, userId, isGlobal = false) {
    if (!userId) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockUser : config.blockUser) + '.messages.no_Valid_UserId')));
      return;
    }

    const channelId = isGlobal ? 'global' : session.channelId;
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0) {
      await ctx.database.create("blockedKeywords", { platform: session.platform, channelId, blockedkeywords: [], blockedusers: [userId] });
    } else {
      const users = record[0].blockedusers;
      if (!users.includes(userId)) {
        users.push(userId);
        await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { blockedusers: users });
      } else {
        await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockUser : config.blockUser) + '.messages.user_Already_Blocked', { userId })));
        return;
      }
    }
    await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_blockUser : config.blockUser) + '.messages.user_Added', { userId })));
  }

  async function removeUser(session, userId, isGlobal = false) {
    if (!userId) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockUser : config.unblockUser) + '.messages.no_Valid_UserId')));
      return;
    }
    const channelId = isGlobal ? 'global' : session.channelId;
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0 || !record[0].blockedusers.includes(userId)) {
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockUser : config.unblockUser) + '.messages.user_Not_Blocked', { userId })));
      return;
    } else {
      const users = record[0].blockedusers.filter(u => u !== userId);
      await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { blockedusers: users });
      await session.send(h.text(session.text('commands.' + (isGlobal ? config.global_unblockUser : config.unblockUser) + '.messages.user_Removed', { userId })));
    }
  }

  async function blockChannel(session, channelId) {
    if (!channelId) {
      await session.send(h.text(session.text('commands.' + config.blockChannel + '.messages.no_Valid_ChannelId')));
      return;
    }
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0) {
      await ctx.database.create("blockedKeywords", { platform: session.platform, channelId, blockedkeywords: [], blockedusers: [], isblockedchannel: true });
    } else {
      if (record[0].isblockedchannel) {
        await session.send(h.text(session.text('commands.' + config.blockChannel + '.messages.channel_Already_Blocked', { channelId })));
        return;
      } else {
        await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { isblockedchannel: true });
      }
    }
    await session.send(h.text(session.text('commands.' + config.blockChannel + '.messages.channel_Added', { channelId })));
  }

  async function unblockChannel(session, channelId) {
    if (!channelId) {
      await session.send(h.text(session.text('commands.' + config.unblockChannel + '.messages.no_Valid_ChannelId')));
      return;
    }
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    if (record.length === 0 || !record[0].isblockedchannel) {
      await session.send(h.text(session.text('commands.' + config.unblockChannel + '.messages.channel_Not_Blocked', { channelId })));
      return;
    } else {
      await ctx.database.set("blockedKeywords", { platform: session.platform, channelId }, { isblockedchannel: false });
      await session.send(h.text(session.text('commands.' + config.unblockChannel + '.messages.channel_Removed', { channelId })));
    }
  }

  async function autoblockChannel(session, channelId) {
    if (!channelId) {
      return;
    }
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId });
    // 仅当数据库中没有该频道的记录时才自动屏蔽
    if (record.length === 0) {
      await ctx.database.create("blockedKeywords", { platform: session.platform, channelId, blockedkeywords: [], blockedusers: [], isblockedchannel: true });
      logInfo(`频道 ${channelId} 已自动加入黑名单`);
    }
  }

  async function checkSelfAction(session, targetId, actionType) {
    // 如果允许自操作，直接返回 false
    if (config.self_operation) {
      return false;
    }
    // 检查是否是对自身的操作
    const isSelfAction = session.channelId === targetId || session.userId === targetId;
    if (isSelfAction) {
      // 发送提示信息，说明不能对自身进行操作
      await session.send(h.text(session.text(`commands.${actionType}.messages.cannot_block_Self`)));
      return true;
    }
    return false;
  }

  if (config.enable_prohibitedKeywords) {
    ctx.before('send', async (session, options) => {
      const prohibitedKeywords = config.prohibitedKeywords;
      for (const keywordObj of prohibitedKeywords) {
        const { keywordContent, isRegex } = keywordObj;
        let match;
        if (isRegex) {
          // 去除开头和结尾的斜杠
          const pattern = keywordContent.replace(/^\/|\/$/g, '');
          const regex = new RegExp(pattern, 'i'); // 转换后再使用
          match = regex.test(session.content);
        } else {
          match = session.content.includes(keywordContent);
        }

        if (match) {
          session.content = '<></>'; // 清空消息
          break;
        }
      }
    });
  }

  ctx.command(name)

  // 添加屏蔽词
  ctx.command(name + '/' + config.blockCommand + ' <keyword>', '添加屏蔽词', { authority: config.command_authority })
    .action(async ({ session }, keyword) => {
      await addKeyword(session, keyword);
    });

  // 取消屏蔽词
  ctx.command(name + '/' + config.unblockCommand + ' <keyword>', '取消屏蔽词', { authority: config.command_authority })
    .action(async ({ session }, keyword) => {
      await removeKeyword(session, keyword);
    });

  // 全局添加屏蔽词
  ctx.command(name + '/' + config.global_blockCommand + ' <keyword>', '全局添加屏蔽词', { authority: config.command_authority })
    .action(async ({ session }, keyword) => {
      await addKeyword(session, keyword, true);
    });

  // 全局取消屏蔽词
  ctx.command(name + '/' + config.global_unblockCommand + ' <keyword>', '全局取消屏蔽词', { authority: config.command_authority })
    .action(async ({ session }, keyword) => {
      await removeKeyword(session, keyword, true);
    });

  // 拉黑用户
  ctx.command(name + '/' + config.blockUser + ' <userId>', '拉黑用户', { authority: config.command_authority })
    .action(async ({ session }, userId) => {
      if (await checkSelfAction(session, userId, config.blockUser)) return;
      await addUser(session, userId);
    });

  // 取消拉黑用户
  ctx.command(name + '/' + config.unblockUser + ' <userId>', '取消拉黑用户', { authority: config.command_authority })
    .action(async ({ session }, userId) => {
      if (await checkSelfAction(session, userId, config.unblockUser)) return;
      await removeUser(session, userId);
    });

  // 全局拉黑用户
  ctx.command(name + '/' + config.global_blockUser + ' <userId>', '全局拉黑用户', { authority: config.command_authority })
    .action(async ({ session }, userId) => {
      if (await checkSelfAction(session, userId, config.global_blockUser)) return;
      await addUser(session, userId, true);
    });

  // 全局取消拉黑用户
  ctx.command(name + '/' + config.global_unblockUser + ' <userId>', '全局取消拉黑用户', { authority: config.command_authority })
    .action(async ({ session }, userId) => {
      if (await checkSelfAction(session, userId, config.global_unblockUser)) return;
      await removeUser(session, userId, true);
    });

  // 拉黑频道
  ctx.command(name + '/' + config.blockChannel + ' <channelId>', '拉黑频道', { authority: config.command_authority })
    .action(async ({ session }, channelId) => {
      if (await checkSelfAction(session, channelId, config.blockChannel)) return;
      await blockChannel(session, channelId);
    });

  // 取消拉黑频道
  ctx.command(name + '/' + config.unblockChannel + ' <channelId>', '取消拉黑频道', { authority: config.command_authority })
    .action(async ({ session }, channelId) => {
      if (await checkSelfAction(session, channelId, config.unblockChannel)) return;
      await unblockChannel(session, channelId);
    });

  // 前置中间件，检查是否有屏蔽的关键词或用户
  ctx.middleware(async (session, next) => {
    logInfo(session.stripped)
    let blockercontent = session.stripped.content;
    const userCommand = blockercontent.split(" ")[0]; // 获取指令的第一个词 作为用户的指令
    const record = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId: session.channelId });
    const globalRecord = await ctx.database.get("blockedKeywords", { platform: session.platform, channelId: 'global' });
    const blockedKeywords = (record[0]?.blockedkeywords || []).concat(globalRecord[0]?.blockedkeywords || []);
    const blockedUsers = (record[0]?.blockedusers || []).concat(globalRecord[0]?.blockedusers || []);
    const isBlockedChannel = record[0]?.isblockedchannel || false;

    // 自动拉黑每个频道 
    if (config.autoblockChannel) {
      await autoblockChannel(session, session.channelId);
    }

    // 首先检查是否为指定用户对指定指令的调用
    const commandUserIdCheck = config.command_userId_list.find(item => item.command === userCommand);

    if (commandUserIdCheck) {
      const { enable, userId, enableobject } = commandUserIdCheck;
      let isMatched = false;

      // 根据 enableobject 判断匹配对象
      switch (enableobject) {
        case '用户ID':
          isMatched = (userId === session.userId);
          break;
        case '频道ID':
          isMatched = (userId === session.channelId);
          break;
        case '平台名称':
          isMatched = (userId === session.platform);
          break;
        default:
          isMatched = (userId === session.userId); // 默认匹配用户ID
      }

      if (enable === '黑名单' && isMatched) {
        // 如果在黑名单中，阻止执行
        logInfo(`对象 ${userId} 尝试调用指令 ${commandUserIdCheck.command}，但在黑名单中，阻止执行`);
        return; // 黑名单中的对象不允许执行该指令
      } else if (enable === '白名单') {
        if (isMatched) {
          // 在白名单中，允许执行
          logInfo(`对象 ${userId} 调用指令 ${commandUserIdCheck.command}，且在白名单中，允许执行`);
          return next(); // 白名单中的对象允许执行
        } else {
          // 不在白名单中，阻止执行
          logInfo(`对象 ${userId} 调用指令 ${commandUserIdCheck.command}，但不在白名单中，不允许执行`);
          return; // 非白名单对象不允许执行该指令
        }
      }
    }

    // 检查频道指令限制
    const commandChannelCheck = config.command_channelId_list.find(item => item.channelId === session.channelId);
    if (commandChannelCheck) {
      if (commandChannelCheck.command !== userCommand) {
        logInfo(`频道 ${session.channelId} 仅允许指令 ${commandChannelCheck.command}，阻止执行 ${userCommand}`);
        return; // 仅允许特定指令
      }
    }

    if (config.Allow_trigger) {
      // 允许通过某些指令      
      const allowedCommands = [
        config.unblockCommand,
        config.global_unblockCommand,
        config.unblockUser,
        config.global_unblockUser,
        config.blockCommand,
        config.global_blockCommand,
        config.blockUser,
        config.global_blockUser,
        config.unblockChannel,
        config.blockChannel
      ];
      for (const command of allowedCommands) {
        if (blockercontent.includes(command)) {
          return next();
        }
      }
    }

    // 如果频道被拉黑，屏蔽消息
    if (isBlockedChannel) {
      if (config.loggerinfo) {
        logInfo(`频道 ${session.channelId} 被拉黑，消息被屏蔽`);
      }
      return;
    }

    // 如果用户被拉黑，屏蔽消息
    if (blockedUsers.includes(session.userId)) {
      if (config.loggerinfo) {
        logInfo(`用户 ${session.userId} 被拉黑，消息被屏蔽`);
      }
      return;
    }

    // 检查是否是取消屏蔽词指令，并且包含已屏蔽的关键词
    if (blockercontent.includes(config.unblockCommand) || blockercontent.includes(config.global_unblockCommand)) {
      for (const keyword of blockedKeywords) {
        if (blockercontent.includes(keyword)) {
          return next(); // 允许取消屏蔽词指令通过
        }
      }
    }

    // 检查是否包含屏蔽的关键词
    for (const keyword of blockedKeywords) {
      if (userCommand === keyword) { // 精确匹配用户指令是否等于屏蔽词
        if (config.loggerinfo) {
          logInfo(`用户 ${session.userId} 输入了被屏蔽的指令：${userCommand}`);
          logInfo(`消息被屏蔽，屏蔽关键词为：${keyword}`);
        }
        return; // 屏蔽消息
      }
    }

    return next();
  }, true /* true 表示这是前置中间件 */);
}

exports.apply = apply;
exports.Config = Config;
exports.name = name;
exports.usage = usage;
exports.inject = inject;