import { Context, Schema, Universal, h } from 'koishi';

export const name = 'image-upscale-bigjpg';

export const inject = ['i18n', 'logger'];

export const usage = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Bigjpg 图片放大插件使用说明</title>
</head>
<body>
<h2>bigjpg 图片放大</h2>
<ul>
<li>支持将图片通过指定的风格进行放大，支持风格化和降噪处理</li>
<li>支持自动查询任务状态，根据配置返回放大后的图片链接、图片或者原始 JSON 数据</li>
<li>提供灵活的配置选项，包括超时时间、自动查询间隔、自定义提示信息等</li>
<li>提供日志调试功能，帮助用户追踪和解决问题</li>
</ul>

---

<h2>使用方法</h2>
<h3>图片放大指令</h3>
<p>用户可以通过 <code>放大图片</code> 命令来上传并放大图片。可以指定放大风格、降噪程度和放大倍数：</p>
<ul>
<li><strong>指令格式</strong>：</li>
</ul>
<pre><code>/放大图片 -s &lt;style&gt; -n &lt;noise&gt; -x &lt;x2&gt;</code></pre>
<ul>
<li><code>-s &lt;style&gt;</code>：指定放大风格，支持 <code>art</code>（卡通插画）和 <code>photo</code>（照片）。</li>
<li><code>-n &lt;noise&gt;</code>：指定降噪程度，支持 <code>-1</code>（无降噪）、<code>0</code>（低降噪）、<code>1</code>（中降噪）、<code>2</code>（高降噪）、<code>3</code>（最高降噪）。</li>
<li><code>-x &lt;x2&gt;</code>：指定放大倍数，支持 <code>1</code>（2x）、<code>2</code>（4x）、<code>3</code>（8x）、<code>4</code>（16x）。</li>
</ul>
<p>例子：</p>
<pre><code>/放大图片 -s art -n 0 -x 2</code></pre>

<h3>查询任务状态</h3>
<p>用户可以使用 <code>查询任务状态 &lt;taskIds...&gt;</code> 来查询已提交任务的状态。任务状态会根据配置返回图片、链接或者 JSON 数据。</p>
<p>例子：</p>
<pre><code>/查询任务状态 dfed390aaa154bf7a9e10dabf93fd7a9</code></pre>

---

<h2>获取 API 密钥</h2>
<p>在使用本插件之前，你需要前往 <a href="https://bigjpg.com/zh" target="_blank">Bigjpg 官网 https://bigjpg.com/zh</a> 注册并获取 API 密钥。此密钥是调用图片放大服务的必需参数。</p>
<p><a href="https://i0.hdslb.com/bfs/article/e2de1d0d0dea0c9b9ab4a1507202841a312276085.png" target="_blank">点击查看获取 API KEY 图解</a></p>

<p><a href="https://i0.hdslb.com/bfs/article/ea2d3a1aa6a060eb5981ea8b7416e899312276085.png" target="_blank">点击查看 Bigjpg 价格表</a></p>

<hr>
</body>
</html>
`;

export interface Config {
  timeout: number;
  waitTimeout: number;
  apiKeys: string[];
  auto_query: boolean;
  auto_query_time: number;
  query_response_mode: 'text' | 'image' | 'raw';
  loggerinfo: boolean;
  wait_text_tip: string;
  bigjpg_style: 'art' | 'photo';
  bigjpg_noise: '-1' | '0' | '1' | '2' | '3';
  bigjpg_x2: '1' | '2' | '3' | '4';
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    apiKeys: Schema.array(Schema.string()).description('API 密钥列表（支持多个）').required(),
    timeout: Schema.number().description('等待上传图片的超时时间（单位：秒）').default(30).min(5).max(90),
    waitTimeout: Schema.number().description('等待用户输入图片的超时时间（单位：秒）').default(30).min(5).max(90),
    wait_text_tip: Schema.string().description('提交任务后返回的 文字提示').default(''),
  }).description('基础设置'),
  Schema.object({
    bigjpg_style: Schema.union([
      Schema.const('art').description('卡通插画'),
      Schema.const('photo').description('照片'),
    ]).role('radio').default('art').description('指定放大风格'),
    bigjpg_noise: Schema.union([
      Schema.const('-1').description('无降噪'),
      Schema.const('0').description('低降噪'),
      Schema.const('1').description('中降噪'),
      Schema.const('2').description('高降噪'),
      Schema.const('3').description('最高降噪'),
    ]).role('radio').default('0').description('指定降噪程度'),
    bigjpg_x2: Schema.union([
      Schema.const('1').description('2x'),
      Schema.const('2').description('4x'),
      Schema.const('3').description('8x'),
      Schema.const('4').description('16x'),
    ]).role('radio').default('2').description('指定放大倍数'),
  }).description('默认请求设置'),
  Schema.object({
    auto_query: Schema.boolean().default(true).description('开启后，提交放大任务后，自动检查任务，返回图片'),
    auto_query_time: Schema.number().description('自动检查任务的时间间隔（单位：秒）').default(10).min(1).max(600),
    query_response_mode: Schema.union([
      Schema.const('text').description('仅返回放大后的图片链接（这个可能安全点）'),
      Schema.const('image').description('直接为发送放大后的图片（可能会被平台压缩等）'),
      Schema.const('raw').description('返回API的原始json数据（不是人用的）'),
    ]).role('radio').default('text'),
  }).description('返回设置'),
  Schema.object({
    loggerinfo: Schema.boolean().default(false).description('日志调试模式'),
  }).description('调试设置'),
]);

interface TaskInfo {
  taskId: string;
  selfId: string;
  channelId: string;
  startTime: number;
}

interface ApiKeyStatus {
  key: string;
  isAvailable: boolean;
  lastFailTime?: number;
}

export function apply(ctx: Context, config: Config) {
  const UPSCALE_URL = 'https://bigjpg.com/api/task/';

  ctx.i18n.define("zh-CN", {
    commands: {
      '放大图片': {
        description: '放大图片',
        messages: {
          'waitprompt': '请在 {0} 秒内发送图片',
          'invalidimage': '未检测到有效的图片，请重新发送。',
          'submit-failed': '提交失败：{0}',
          'unknown-error': '未知错误',
          'task-submitted': '已经提交任务咯~ 任务ID为：{0}'
        }
      },
      '查询任务状态': {
        description: '查询任务状态',
        messages: {
          'query-no-taskid': '请提供至少一个任务ID。',
          'query-not-found': '未找到对应的任务，请检查任务ID是否正确或稍后重试。',
          'task-result-link': '任务ID：{0}，放大后的图片链接：{1}',
          'task-status': '任务ID：{0}，状态：{1}'
        }
      },
    }
  });

  // API Key 管理
  const apiKeyStatuses: ApiKeyStatus[] = config.apiKeys.map(key => ({
    key,
    isAvailable: true
  }));

  // 任务队列
  const taskQueue: TaskInfo[] = [];

  function logInfo(message: string) {
    if (config.loggerinfo) {
      ctx.logger.info(message);
    }
  }

  // 获取可用的 API Key
  function getAvailableApiKey(): string | null {
    const availableKey = apiKeyStatuses.find(status => status.isAvailable);
    return availableKey ? availableKey.key : null;
  }

  // 标记 API Key 不可用
  function markApiKeyUnavailable(apiKey: string) {
    const keyStatus = apiKeyStatuses.find(status => status.key === apiKey);
    if (keyStatus) {
      keyStatus.isAvailable = false;
      keyStatus.lastFailTime = Date.now();
      logInfo(`API Key ${apiKey.slice(0, 10)}... 已标记为不可用`);
    }
  }

  // 重置 API Key 状态（可选，用于定期重试）
  function resetApiKeyStatus() {
    const now = Date.now();
    apiKeyStatuses.forEach(status => {
      if (!status.isAvailable && status.lastFailTime && (now - status.lastFailTime > 300000)) { // 5分钟后重试
        status.isAvailable = true;
        logInfo(`API Key ${status.key.slice(0, 10)}... 状态已重置为可用`);
      }
    });
  }

  // 放大图片函数
  async function upscaleImage(style: 'art' | 'photo', noise: '-1' | '0' | '1' | '2' | '3', x2: '1' | '2' | '3' | '4', input: string): Promise<{ success: boolean; taskId?: string; error?: string }> {
    logInfo(`开始放大图片，参数: style=${style}, noise=${noise}, x2=${x2}, input=${input}`);

    let lastError = '';

    // 依次尝试可用的 API Key，直到成功或全部失败
    for (const keyStatus of apiKeyStatuses) {
      if (!keyStatus.isAvailable) continue;

      try {
        logInfo(`尝试使用 API Key: ${keyStatus.key.slice(0, 10)}...`);
        const response = await fetch(UPSCALE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': keyStatus.key,
          },
          body: JSON.stringify({
            style,
            noise,
            x2,
            input,
          }),
        });
        const result = await response.json();
        logInfo(`放大图片响应: ${JSON.stringify(result)}`);

        if (response.ok && result.tid) {
          logInfo(`使用 API Key ${keyStatus.key.slice(0, 10)}... 成功提交任务`);
          return { success: true, taskId: result.tid };
        } else {
          lastError = result.error || '未知错误';
          logInfo(`API Key ${keyStatus.key.slice(0, 10)}... 返回错误: ${lastError}`);

          // 如果是 API Key 相关错误，标记为不可用并尝试下一个
          if (response.status === 401 || response.status === 403) {
            markApiKeyUnavailable(keyStatus.key);
            continue; // 继续尝试下一个 key
          } else {
            // 如果不是认证错误，可能是其他问题（如参数错误、服务器错误等），直接返回错误
            return { success: false, error: lastError };
          }
        }
      } catch (error) {
        lastError = error.message;
        logInfo(`使用 API Key ${keyStatus.key.slice(0, 10)}... 请求失败: ${error.message}`);
        // 网络错误等，继续尝试下一个 key
        continue;
      }
    }

    return { success: false, error: lastError || '所有 API Key 都不可用' };
  }

  // 查询任务状态函数
  async function queryTaskStatus(taskIds: string[]): Promise<any> {
    logInfo(`查询任务状态，任务ID: ${taskIds.join(',')}`);

    const apiKey = getAvailableApiKey();
    if (!apiKey) {
      logInfo('没有可用的 API Key');
      return null;
    }

    try {
      const url = `${UPSCALE_URL}${taskIds.join(',')}`;
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': apiKey,
        },
      });
      const result = await response.json();
      logInfo(`查询任务状态响应: ${JSON.stringify(result)}`);
      if (response.ok) {
        return result;
      } else {
        if (response.status === 401 || response.status === 403) {
          markApiKeyUnavailable(apiKey);
        }
        return null;
      }
    } catch (error) {
      logInfo(`查询任务状态请求失败: ${error.message}`);
      return null;
    }
  }

  // 后台轮询任务状态
  async function pollTaskStatus() {
    if (taskQueue.length === 0) return;

    resetApiKeyStatus(); // 定期重置 API Key 状态

    const currentTime = Date.now();
    const tasksToQuery = taskQueue.filter(task => currentTime - task.startTime < 600000); // 10分钟超时

    if (tasksToQuery.length === 0) {
      taskQueue.length = 0; // 清空超时任务
      return;
    }

    const taskIds = tasksToQuery.map(task => task.taskId);
    const result = await queryTaskStatus(taskIds);

    if (!result) return;

    // 处理完成的任务
    for (const task of tasksToQuery) {
      const taskResult = result[task.taskId];
      if (taskResult && taskResult.status === 'success') {
        try {
          const bot = Object.values(ctx.bots).find(b => b.selfId === task.selfId || b.user?.id === task.selfId);
          if (!bot || bot.status !== Universal.Status.ONLINE) {
            ctx.logger.error(`机器人离线或未找到: ${task.taskId}`);
            return;
          }
          if (bot) {
            const imageUrl = taskResult.url;
            let message = '';

            if (config.query_response_mode === 'text') {
              message = `放大后的图片链接：${imageUrl}`;
            } else if (config.query_response_mode === 'image') {
              message = h.image(imageUrl).toString();
            } else if (config.query_response_mode === 'raw') {
              message = JSON.stringify(taskResult, null, 2);
            }

            await bot.sendMessage(task.channelId, message);
            logInfo(`任务 ${task.taskId} 完成，已发送结果到频道 ${task.channelId}`);
          }
        } catch (error) {
          logInfo(`发送任务结果失败: ${error.message}`);
        }

        // 从队列中移除已完成的任务
        const index = taskQueue.findIndex(t => t.taskId === task.taskId);
        if (index !== -1) {
          taskQueue.splice(index, 1);
        }
      }
    }
  }

  // 启动轮询
  const pollInterval = setInterval(pollTaskStatus, config.auto_query_time * 1000);

  // 插件卸载时清理定时器
  ctx.on('dispose', () => {
    clearInterval(pollInterval);
  });

  // 定义 koishi 指令
  ctx.command('bigjpg', '图片放大相关指令') // 父级指令
  ctx.command('bigjpg/放大图片')
    .option('style', '-s <style:string> 指定放大风格。参数有 art, photo 分别表示 卡通插画, 照片', {
      fallback: config.bigjpg_style,
    })
    .option('noise', '-n <noise:string> 指定降噪程度。参数有 -1, 0, 1, 2, 3 分别表示降噪程度 无, 低, 中, 高, 最高', {
      fallback: config.bigjpg_noise,
    })
    .option('x2', '-x <x2:string> 指定放大倍数。参数有 1, 2, 3, 4 分别表示 2x, 4x, 8x, 16x', {
      fallback: config.bigjpg_x2,
    })
    .action(async ({ session, options }) => {
      // 检测输入的图片内容
      let src = (h.select(session.stripped.content, 'img').map(item => item.attrs.src)[0] ||
        h.select(session.quote?.content, "img").map((a) => a.attrs.src)[0] ||
        h.select(session.quote?.content, "mface").map((a) => a.attrs.url)[0]);

      if (!src) {
        logInfo("暂未输入图片，即将交互获取图片输入");
      } else {
        logInfo(src.slice(0, 500));
      }

      if (!src) {
        const [msgId] = await session.send(session.text(".waitprompt", [config.waitTimeout]));
        const promptcontent = await session.prompt(config.waitTimeout * 1000);
        if (promptcontent !== undefined) {
          src = h.select(promptcontent, 'img')[0]?.attrs.src || h.select(promptcontent, 'mface')[0]?.attrs.url;
        }
        try {
          await session.bot.deleteMessage(session.channelId, msgId);
        } catch {
          ctx.logger.warn(`在频道 ${session.channelId} 尝试撤回消息ID ${msgId} 失败。`);
        }
      }

      const quote = h.quote(session.messageId);
      if (!src) {
        await session.send(`${quote}${session.text(".invalidimage")}`);
        return;
      }

      logInfo(`用户发送的图片链接: ${src}`);
      logInfo(`放大参数：风格：${options.style}，降噪程度：${options.noise}，放大倍数：${options.x2}`);

      const response = await upscaleImage(
        options.style as 'art' | 'photo',
        options.noise as '-1' | '0' | '1' | '2' | '3',
        options.x2 as '1' | '2' | '3' | '4',
        src
      );

      if (response.success && response.taskId) {
        logInfo(`任务提交成功，任务ID：${response.taskId}`);
        const waitTip = config.wait_text_tip || session.text('.task-submitted', [response.taskId]);
        await session.send(config.wait_text_tip ? `${config.wait_text_tip}${response.taskId}` : waitTip);

        if (config.auto_query) {
          // 将任务添加到后台轮询队列
          taskQueue.push({
            taskId: response.taskId,
            selfId: session.selfId,
            channelId: session.channelId,
            startTime: Date.now()
          });
          logInfo(`任务 ${response.taskId} 已添加到后台轮询队列`);
        }
      } else {
        return session.text('.submit-failed', [response.error || session.text('.unknown-error')]);
      }
    });

  // 查询任务状态指令
  ctx.command('bigjpg/查询任务状态 <taskIds...>')
    .action(async ({ session }, ...taskIds) => {
      if (taskIds.length === 0) {
        return session.text('.query-no-taskid');
      }
      const response = await queryTaskStatus(taskIds);
      if (!response || Object.keys(response).length === 0) {
        return session.text('.query-not-found');
      }
      for (const taskId in response) {
        if (response[taskId].status === 'success') {
          const imageUrl = response[taskId].url;
          if (config.query_response_mode === 'text') {
            await session.send(session.text('.task-result-link', [taskId, imageUrl]));
          } else if (config.query_response_mode === 'image') {
            await session.send(h.image(imageUrl));
          } else if (config.query_response_mode === 'raw') {
            await session.send(JSON.stringify(response, null, 2));
          }
        } else {
          await session.send(session.text('.task-status', [taskId, response[taskId].status]));
        }
      }
    });
}
