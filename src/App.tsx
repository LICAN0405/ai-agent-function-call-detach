import { useState } from 'react'

const API_KEY = 'sk-2rw01OQlkcia0R6gH7HHy0ogHA1MHEeCRpYZ5ICGtGVKh6gS'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content?: string
  name?: string
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

const generateId = () => Math.random().toString(36).substr(2, 9)

const getCurrentTime = () => {
  const now = new Date()
  const weekArr = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return {
    日期: now.toLocaleDateString(),
    时间: now.toLocaleTimeString(),
    星期: weekArr[now.getDay()],
  }
}

const calcNum = (a: number, b: number, op: 'add' | 'sub') => {
  if (op === 'add') return a + b
  if (op === 'sub') return a - b
  return 0
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'getCurrentTime',
      description: '获取当前系统的日期、具体时间和星期几',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcNum',
      description: '对两个数字做加法或者减法运算',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: '第一个数字' },
          b: { type: 'number', description: '第二个数字' },
          op: { type: 'string', enum: ['add', 'sub'], description: '运算类型：add加法，sub减法' },
        },
        required: ['a', 'b', 'op'],
      },
    },
  },
]

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const executeTool = (toolName: string, toolArgs: any) => {
    console.log(`[工具执行] 工具名: ${toolName}, 参数:`, toolArgs)
    if (toolName === 'getCurrentTime') return getCurrentTime()
    if (toolName === 'calcNum') return calcNum(toolArgs.a, toolArgs.b, toolArgs.op)
    return { error: '未知工具' }
  }

  const callKimiAPI = async (currentMessages: Message[]) => {
    console.log(`[API调用] 消息数量: ${currentMessages.length}`)

    if (!API_KEY) {
      throw new Error('API_KEY 为空，请设置有效的 API Key')
    }

    const apiMessages = currentMessages.map((msg) => {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content,
        name: msg.name,
      }

      if (msg.tool_calls) {
        apiMsg.tool_calls = msg.tool_calls
      }

      if (msg.tool_call_id) {
        apiMsg.tool_call_id = msg.tool_call_id
      }

      return apiMsg
    })

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: apiMessages,
        stream: false,
        tools,
        tool_choice: 'auto',
      }),
    })

    console.log(`[API响应] 状态码: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API错误 [${response.status}]: ${errorText}`)
    }

    const result = await response.json()
    console.log(`[API响应] 完整响应:`, JSON.stringify(result))

    return result
  }

  // 处理对话的函数
  const processConversation = async (initialMessages: Message[]): Promise<Message[]> => {
    console.log('[对话处理] 开始处理，初始消息数:', initialMessages.length)

    let currentMessages = [...initialMessages]
    let hasMore = true

    while (hasMore) {
      const response = await callKimiAPI(currentMessages)
      const message = response.choices?.[0]?.message

      if (!message) {
        throw new Error('API 未返回消息')
      }

      console.log('[对话处理] API 返回消息:', JSON.stringify(message))

      // 添加助手消息
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
      }

      if (message.content) {
        assistantMessage.content = message.content
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        assistantMessage.tool_calls = message.tool_calls
      }

      currentMessages = [...currentMessages, assistantMessage]

      // 如果有工具调用，执行工具
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log('[对话处理] 检测到工具调用:', message.tool_calls)

        const toolResultMessages: Message[] = []
        for (const toolCall of message.tool_calls) {
          if (toolCall.function && toolCall.function.name) {
            let args: any = {}
            try {
              args =
                typeof toolCall.function.arguments === 'string'
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments
            } catch (e) {
              console.error('[参数解析失败]', e)
            }
            const result = executeTool(toolCall.function.name, args)

            toolResultMessages.push({
              id: generateId(),
              role: 'tool',
              name: toolCall.function.name,
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            })
          }
        }

        currentMessages = [...currentMessages, ...toolResultMessages]
        // 继续循环处理工具结果
      } else {
        // 没有工具调用，对话结束
        hasMore = false
      }
    }

    return currentMessages
  }

  // 发送消息入口函数
  // 关键修复：不使用 useCallback，避免闭包捕获旧状态
  const sendMessage = async () => {
    const userMsg = input.trim()
    if (!userMsg) {
      console.log('[发送] 输入为空')
      return
    }

    if (loading) {
      console.log('[发送] 正在加载中，忽略请求')
      return
    }

    // 立即设置 loading 状态
    setLoading(true)
    setInput('')
    setError(null)

    // 创建用户消息
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: userMsg,
    }

    // 使用函数式更新添加用户消息，并获取最新状态用于处理
    setMessages((prev) => {
      const newMessages = [...prev, userMessage]

      // 在函数式更新内部，prev 是最新的状态
      // 立即启动对话处理
      ;(async () => {
        try {
          // 使用 prev（最新状态）+ 用户消息作为初始消息
          const currentMessages = [...prev, userMessage]
          console.log('[发送] 当前消息数量:', currentMessages.length)

          // 处理对话
          const finalMessages = await processConversation(currentMessages)

          // 更新最终消息列表
          setMessages(finalMessages)
          console.log('[发送] 对话处理完成，最终消息数:', finalMessages.length)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '未知错误'
          console.error('[发送错误]', errorMsg)
          setError(errorMsg)
          setMessages((prev2) => [
            ...prev2,
            {
              id: generateId(),
              role: 'assistant',
              content: '抱歉，请求出错：' + errorMsg,
            },
          ])
        } finally {
          setLoading(false)
        }
      })()

      return newMessages
    })
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h2>AI Agent 工具调用</h2>

      {/* API Key 警告 */}
      {!API_KEY && (
        <div
          style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeeba',
            borderRadius: 4,
            padding: 12,
            marginBottom: 16,
            color: '#856404',
          }}
        >
          ⚠️ 警告：API_KEY 为空，请设置有效的 Kimi API Key
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div
          style={{
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: 4,
            padding: 12,
            marginBottom: 16,
            color: '#721c24',
          }}
        >
          ❌ 错误：{error}
        </div>
      )}

      <div
        style={{
          height: '400px',
          border: '1px solid #eee',
          padding: 16,
          borderRadius: 8,
          overflowY: 'auto',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', padding: '40px 0' }}>
            开始对话吧！问我问题，我可以帮您获取当前时间或进行简单计算。
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ margin: '8px 0' }}>
              <strong>{m.role === 'user' ? '你：' : m.role === 'tool' ? '🛠 工具返回：' : 'AI：'}</strong>
              <p style={{ margin: 0, display: 'inline' }}>
                {m.tool_calls ? `调用工具: ${m.tool_calls.map((tc) => tc.function.name).join(', ')}` : m.content}
              </p>
            </div>
          ))
        )}
        {loading && <div style={{ color: '#666', fontStyle: 'italic' }}>AI 思考中...</div>}
      </div>
      <div style={{ marginTop: 16, display: 'flex' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          style={{ flex: 1, padding: '10px', fontSize: 16, border: '1px solid #ddd', borderRadius: 4 }}
          placeholder="输入问题（如：现在几点了？）..."
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '10px 20px',
            marginLeft: 8,
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          disabled={loading}
        >
          发送
        </button>
      </div>
    </div>
  )
}

export default App
