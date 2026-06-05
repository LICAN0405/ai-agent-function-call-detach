import { useState } from 'react'

// 信息结构
interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content?: string
  // name 主要用于 role 为 tool 的消息，表示这条工具结果来自哪个工具。
  name?: string
  // tool_calls 表示 AI 想要调用的工具列表。
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      // 工具函数名，比如 getCurrentTime 或 calcNum。
      name: string
      // 工具参数。
      arguments: string
    }
  }>

  // tool_call_id 用在 role 为 tool 的消息上。
  // 它告诉 AI：这条工具结果对应的是之前哪一次工具调用。
  tool_call_id?: string
}

// 生成一个简单的随机 id。
const generateId = () => Math.random().toString(36).substr(2, 9)

function App() {
  // messages 保存整个聊天记录。
  const [messages, setMessages] = useState<Message[]>([])
  // input 保存输入框当前的文字。
  const [input, setInput] = useState('')
  // loading 为 true 时，禁用输入框和按钮，避免重复发送。
  const [loading, setLoading] = useState(false)
  // 没有错误时是 null，有错误时是字符串。
  const [error, setError] = useState<string | null>(null)


  //负责调用 Kimi 接口。
  const callAgentAPI = async (currentMessages: Message[]): Promise<Message[]> => {
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
    
    const response = await fetch('http://localhost:8080/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: apiMessages,
      }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API错误 [${response.status}]: ${errorText}`)
    }
    const result = await response.json()
    return result.map((msg: any) => ({
      id: generateId(),
      ...msg,
    }))
  }

  // sendMessage 是发送消息的入口函数。
  const sendMessage = async () => {
    // 读取输入框内容。
    const userMsg = input.trim()

    // 判断输入是否为空。
    if (!userMsg) return
    // 判断当前是否正在请求 AI，防止重复发送。
    if (loading) return
    // 设置页面进入加载状态。
    setLoading(true)
    // 清空输入框。
    setInput('')
    // 清空上一次错误信息。
    setError(null)
    // 创建一条用户消息。
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: userMsg,
    }
    // 处理请求(调用callAgentAPI，向后端发起请求，获取并显示结果)。
    setMessages((prev) => {
      // 把用户消息先显示到页面上。
      const newMessages = [...prev, userMessage]
      ;(async () => {
        try {
          // 当前上下文 = 之前所有消息 + 当前用户消息。
          const currentMessages = [...prev, userMessage]
          const finalMessages = await callAgentAPI(currentMessages)
          // 把最终得到的消息列表更新到页面上。
          setMessages(finalMessages)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '未知错误'
          setError(errorMsg)
          // 用户页面显示错误信息。
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
      // 返回得到新消息列表
      return newMessages
    })
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h2>AI Agent 工具调用（前后分离）</h2>

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
          错误：{error}
        </div>
      )}

      {/* 聊天消息展示区域。 */}
      <div
        style={{
          height: '400px',
          border: '1px solid #eee',
          padding: 16,
          borderRadius: 8,
          overflowY: 'auto',
        }}
      >
        {/* 如果还没有任何消息，就显示一个空状态提示。 */}
        {messages.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', padding: '40px 0' }}>
            开始对话吧！问我问题，我可以帮您获取当前时间或进行简单计算。
          </div>
        ) : (
          // 如果有消息，就遍历 messages，把每条消息渲染到页面上。
          messages.map((m) => (
            <div key={m.id} style={{ margin: '8px 0' }}>
              {/* 根据消息角色显示不同的前缀。 */}
              <strong>{m.role === 'user' ? '你：' : m.role === 'tool' ? '工具返回：' : 'AI：'}</strong>

              <p style={{ margin: 0, display: 'inline' }}>
                {/* 如果这条 assistant 消息包含 tool_calls，就显示调用了哪些工具。 */}
                {/* 否则就显示普通消息内容。 */}
                {m.tool_calls
                  ? `调用工具: ${m.tool_calls
                      .map((tc) => `${tc.function.name}(${tc.function.arguments})`)
                      .join(', ')}`
                  : m.content}
              </p>
            </div>
          ))
        )}

        {loading && <div style={{ color: '#666', fontStyle: 'italic' }}>AI 思考中...</div>}
      </div>

      {/* 底部输入区域。 */}
      <div style={{ marginTop: 16, display: 'flex' }}>
        <input
          // value 绑定 input 状态，表示输入框内容由 React 状态控制。
          value={input}

          // 用户输入时，更新 input 状态。
          onChange={(e) => setInput(e.target.value)}

          // 用户按下 Enter 时发送消息。
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}

          style={{ flex: 1, padding: '10px', fontSize: 16, border: '1px solid #ddd', borderRadius: 4 }}
          placeholder="输入问题（如：现在几点了？）..."

          // 加载中禁用输入框，避免用户重复提交。
          disabled={loading}
        />

        <button
          // 点击按钮时发送消息。
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
          // 加载中禁用按钮。
          disabled={loading}
        >
          发送
        </button>
      </div>
    </div>
  )
}

export default App
