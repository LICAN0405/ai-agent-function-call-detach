import { Bubble, Sender } from '@ant-design/x'
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

  // 把 messages 转换成 Bubble 组件需要的格式。
   const bubbleItems = messages.map((msg) => {
    let content = msg.content || ''
    let role: 'user' | 'ai' = msg.role === 'user' ? 'user' : 'ai'
    
    // 处理 tool_calls 的显示
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCallText = `🔧 调用工具: ${msg.tool_calls
        .map((tc) => `${tc.function.name}(${tc.function.arguments})`)
        .join(', ')}`
      content = content ? `${toolCallText}\n\n${content}` : toolCallText
    }
    
    // 处理 tool 角色的消息
    if (msg.role === 'tool') {
      role = 'ai'
      content = `📦 工具返回: ${content || ''}`
    }
    
    return {
      key: msg.id,
      role,
      content,
    }
  })

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
        ) :(
          <Bubble.List
            items={bubbleItems}
            role={{
              user: {
                placement: 'end',
                variant: 'filled',
                styles: {
                  content: {
                    background: '#e6f7ff',
                  },
                },
              },
              ai: {
                placement: 'start',
                variant: 'outlined',
              },
            }}
          />
        )}

        {loading && <div style={{ color: '#666', fontStyle: 'italic' }}>AI 思考中...</div>}
      </div>

      {/* 底部输入区域。 */}
         <div style={{ marginTop: 16 }}>
        <Sender
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          loading={loading}
          placeholder="输入问题（如：1+2+3等于多少？）..."
          disabled={loading}
          style={{ borderRadius: 8 }}
        />
      </div>
    </div>
  )
}

export default App
