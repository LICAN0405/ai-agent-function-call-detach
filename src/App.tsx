import { useState } from 'react';

//换成 Kimi API Key
const API_KEY = 'sk-rQMW19ExO0aBHG4z8BB2jfbjOrfb6REOyh2dRRugztbcSV3i';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  // 聊天对话框信息
  const [messages, setMessages] = useState<Message[]>([]);
  // 输入框信息
  const [input, setInput] = useState('');
  // 加载状态
  const [loading, setLoading] = useState(false);
  // 点击发送键执行函数
  const sendMessage = async () => {
    // 记录下用户输入的信息
    if (!input.trim() || loading) return;
    const userMsg = input;
    // 清空用户输入框内容
    setInput('');
    // 设置为加载中
    setLoading(true);
// 将用户输入的记录下到展示对话信息框
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMsg },
    ];
    setMessages(newMessages);

    try {
      // 发送消息给gpt接口
      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',//告诉服务器发送的是json格式
          Authorization: `Bearer ${API_KEY}`,//带上密钥
        },
        // 把消息对象变成 字符串 发给服务器
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: newMessages,//把聊天框所有信息（之前的聊天内容全部传给ai）
          stream: true,//开启流式，让 AI 一字一字返回
          temperature: 0.3,
        }),
      });

      const reader = res.body?.getReader();//1.给服务器返回的数据流创建一个读取器（getReader），帮你一段一段读 AI 返回的数据
      //没拿到读取流工具就直接结束
      if (!reader) {
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder('utf-8');//2.二进制转字符串工具
      let buffer = '';//3.临时缓存区（流是一段一段来的，先存起来）

      while (true) {
        //读一段数据，返回done（是否读完），value（读到的二进制）
        const { done, value } = await reader.read();//异步逐片读取二进制
        // 读完则停止循环
        if (done) break;

        // 把当前读到的这一段二进制流转化为字符串并拼接到临时缓存区
        buffer += decoder.decode(value, { stream: true });//把数据拼成完整行：decoder.decode把二进制数据转化为字符串，{ stream: true } 表示：这是一段一段来的流
        // 按换行符把数据切成数组，使得显示为一行一行的
        const lines = buffer.split('\n');
        //如果切完还有剩一段不完整的就把这个存到buffer中，等下一段流来再拼接上去，在执行 切成数组操作
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;// 跳过空行、非数据行

          const data = line.replace(/^data: /, '').trim();//把 data: 去掉 ； 去除首尾空格 ； 空行过滤
          // 结束标志：AI 说完了
          if (data === '[DONE]') {
            setLoading(false);
            continue;
          }

          try {
            const json = JSON.parse(data);//把字符串转成 JSON 对象
            const delta = json.choices?.[0]?.delta?.content;//取出 AI 新增的那几个字
            if (delta) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + delta },
                  ];
                } else {
                  return [...prev, { role: 'assistant', content: delta }];
                }
              });
            }
          } catch (e) {
            // 忽略解析错误（比如中间不完整的 chunk）
          }
        }
      }
    } catch (error) {
      console.error('请求出错：', error);
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h2>AI Agent 第1天：Kimi 流式对话</h2>
      <h2>ai小助手</h2>
      <div
        style={{
          height: '400px',
          border: '1px solid #eee',
          padding: 16,
          borderRadius: 8,
          overflowY: 'auto',
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0' }}>
            <strong>{m.role === 'user' ? '你：' : 'AI：'}</strong>
            <p style={{ margin: 0, display: 'inline' }}>{m.content}</p>
          </div>
        ))}
        {loading && <div>AI 思考中...</div>}
      </div>
      <div style={{ marginTop: 16, display: 'flex' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          style={{ flex: 1, padding: '10px', fontSize: 16 }}
          placeholder="输入问题..."
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          style={{ padding: '0 20px', marginLeft: 8 }}
          disabled={loading}
        >
          发送
        </button>
      </div>
    </div>
  );
}

export default App;

// 整给项目的流程：用户在输入框中输入问题，点击发送就会执行sendMessage函数
// 这个函数首先会记录用户问题，并清空输入框数据，显示加载ai回答并在消息框中添加用户当前聊天信息。然后调用接口上传问题
// 利用读取器一段一段地读取服务端返回的数据流（二进制）并利用decoder.decode将其转化为字符串
// 每段数据流会根据换行符进行切行为数组（剩余后面没换行符的就放进临时缓存区，等到下一段流来就把这个加到下一段流上）
// 并把这个数组中数据流一个一个进行操作（比如说去掉每个前面的data）得到这行最终需要展示的数据。然后将这段数据拼接到消息框中。


// 整个项目标准流程：
// 用户输入问题，点击发送，触发 sendMessage
// 保存用户消息，清空输入框，显示加载状态，并把用户消息渲染到页面
// 向后端（Kimi）发送流式接口请求
// 用 reader 循环读取二进制流
// 用 TextDecoder 把二进制转字符串
// 按换行符 \n 切割成行数组
// 不完整的行存入 buffer，等待下一段流拼接
// 逐行解析：去掉 data: 前缀 → 提取 delta 增量文字
// 把每一段新文字追加到 AI 消息中
// 直到流结束，关闭加载状态

// SSE 

