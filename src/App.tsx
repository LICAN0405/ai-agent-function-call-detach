import { useState } from 'react'

const API_KEY = 'sk-gUtGFpows0HoF0LLCzotxG2ZgCKNl596jMiz1a7ZNudFfvTq'

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

// 这是第一个本地工具：获取当前时间。
const getCurrentTime = () => {
  const now = new Date()
  const weekArr = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return {
    日期: now.toLocaleDateString(),
    时间: now.toLocaleTimeString(),
    星期: weekArr[now.getDay()],
  }
}

// 这是第二个本地工具：计算两个数字。
const calcNum = (a: number, b: number, op: 'add' | 'sub') => {
  if (op === 'add') return a + b
  if (op === 'sub') return a - b
  return 0
}

// 计算完整数学表达式，例如 1+2+3+4+5、(1+2)*3。
const calcExpression = (expression: string) => {
  const normalized = expression.replace(/\s/g, '')

  if (!/^[0-9+\-*/().]+$/.test(normalized)) {
    return { expression, error: '表达式包含不支持的字符' }
  }

  const nums: number[] = []
  const ops: string[] = []
  const priority: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
  }

  const applyOp = () => {
    const op = ops.pop()
    const right = nums.pop()
    const left = nums.pop()

    if (!op || left === undefined || right === undefined) {
      throw new Error('表达式格式错误')
    }

    if (op === '+') nums.push(left + right)
    if (op === '-') nums.push(left - right)
    if (op === '*') nums.push(left * right)
    if (op === '/') {
      if (right === 0) throw new Error('除数不能为 0')
      nums.push(left / right)
    }
  }

  try {
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i]
      const prevChar = normalized[i - 1]
      const nextChar = normalized[i + 1]
      const isUnaryNumber =
        (char === '+' || char === '-') &&
        (i === 0 || '+-*/('.includes(prevChar)) &&
        /\d|\./.test(nextChar)

      if (/\d|\./.test(char) || isUnaryNumber) {
        let numText = char

        while (i + 1 < normalized.length && /[\d.]/.test(normalized[i + 1])) {
          numText += normalized[i + 1]
          i++
        }

        const num = Number(numText)
        if (Number.isNaN(num)) throw new Error('数字格式错误')
        nums.push(num)
        continue
      }

      if (char === '(') {
        ops.push(char)
        continue
      }

      if (char === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          applyOp()
        }

        if (!ops.length) throw new Error('括号不匹配')
        ops.pop()
        continue
      }

      if ('+-*/'.includes(char)) {
        while (
          ops.length &&
          ops[ops.length - 1] !== '(' &&
          priority[ops[ops.length - 1]] >= priority[char]
        ) {
          applyOp()
        }

        ops.push(char)
      }
    }

    while (ops.length) {
      if (ops[ops.length - 1] === '(') throw new Error('括号不匹配')
      applyOp()
    }

    if (nums.length !== 1) throw new Error('表达式格式错误')

    return {
      expression,
      result: nums[0],
    }
  } catch (err) {
    return {
      expression,
      error: err instanceof Error ? err.message : '表达式计算失败',
    }
  }
}

// tools 是“工具说明书”
// 它的作用是告诉 Kimi：
// 1. 我这里有哪些工具可以用。
// 2. 每个工具叫什么名字。
// 3. 每个工具能做什么。
// 4. 每个工具需要哪些参数。
const tools = [
  {
    type: 'function',
    function: {
      name: 'getCurrentTime',
      // description 帮助 AI 判断什么时候该调用这个工具。
      description: '获取当前系统的日期、具体时间和星期几',

      // 这个工具不需要参数，所以 properties 是空对象。
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
          op: {
            type: 'string',
            enum: ['add', 'sub'],
            description: '运算类型：add 加法，sub 减法',
          },
        },
        // required 表示这些参数必须提供。
        required: ['a', 'b', 'op'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcExpression',
      description: '计算完整数学表达式，适合处理 1+2+3+4+5、(1+2)*3 这类连续或复杂运算',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '完整数学表达式，例如 "1+2+3+4+5"',
          },
        },
        required: ['expression'],
      },
    },
  },
]

function App() {
  // messages 保存整个聊天记录。
  const [messages, setMessages] = useState<Message[]>([])
  // input 保存输入框当前的文字。
  const [input, setInput] = useState('')
  // loading 为 true 时，禁用输入框和按钮，避免重复发送。
  const [loading, setLoading] = useState(false)
  // 没有错误时是 null，有错误时是字符串。
  const [error, setError] = useState<string | null>(null)

  // executeTool 是工具执行入口。
  // AI 返回的只是“我要调用哪个工具、参数是什么”。
  const executeTool = (toolName: string, toolArgs: any) => {
    if (toolName === 'getCurrentTime') return getCurrentTime()
    if (toolName === 'calcNum') return calcNum(toolArgs.a, toolArgs.b, toolArgs.op)
    if (toolName === 'calcExpression') return calcExpression(toolArgs.expression)
    return { error: '未知工具' }
  }

  //负责调用 Kimi 接口。
  const callKimiAPI = async (currentMessages: Message[]) => {
    // 检查有没有 API Key。
    if (!API_KEY) {
      throw new Error('API_KEY 为空，请设置有效的 API Key')
    }

    // 把前端内部消息格式转换成 API 需要的消息格式。
    const apiMessages = currentMessages.map((msg) => {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content,
        name: msg.name,
      }
      // 如果 assistant 消息里包含 tool_calls，要传给 API。
      if (msg.tool_calls) {
        apiMsg.tool_calls = msg.tool_calls
      }
      // 如果是 tool 消息，要带上 tool_call_id。
      if (msg.tool_call_id) {
        apiMsg.tool_call_id = msg.tool_call_id
      }
      return apiMsg
    })

    // fetch 是浏览器内置的网络请求函数。
    // await 表示等待请求完成后，再继续往下执行。
    // 发起请求
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        // 告诉服务器：请求体是 JSON 格式。
        'Content-Type': 'application/json',
        // Authorization 用来携带 API Key。
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        // 把完整对话上下文传给模型。
        messages: [
          {
            role: 'system',
            content:
              '当用户提出连续计算或复杂数学表达式时，优先调用 calcExpression，并把完整表达式作为 expression 参数传入。只有明确只计算两个数字的加减法时，才使用 calcNum。',
          },
          ...apiMessages,
        ],
        // 这里关闭流式输出。
        stream: false,
        // 把工具说明书传给模型。
        tools,
        // auto 表示让模型自己判断是否需要调用工具。
        tool_choice: 'auto',
      }),
    })

    // response.ok 为 false，说明 HTTP 请求失败
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API错误 [${response.status}]: ${errorText}`)
    }

    // 把接口返回的 JSON 字符串解析成 JS 对象。
    const result = await response.json()
    return result
  }

  // 它完整处理一次“Agent 对话”：
  // 1. 把用户消息发给 Kimi。
  // 2. Kimi 可能直接回答，也可能要求调用工具。
  // 3. 如果 Kimi 要调用工具，前端执行对应工具。
  // 4. 把工具结果再发给 Kimi。
  // 5. Kimi 根据工具结果生成最终回答。
  const processConversation = async (initialMessages: Message[]): Promise<Message[]> => {
    let currentMessages = [...initialMessages]
    let hasMore = true

    while (hasMore) {
      // 调用接口函数
      const response = await callKimiAPI(currentMessages)

      // 取出返回的第一条 assistant 消息。
      const message = response.choices?.[0]?.message

      // 如果没有拿到消息，说明接口响应格式不符合预期。
      if (!message) {
        throw new Error('API 未返回消息')
      }

      // 创建一条 assistant 消息。
      // 注意：assistant 消息可能有两种情况：
      // 1. 有 content：普通文本回复。
      // 2. 有 tool_calls：AI 要求调用工具。
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
      }

      // 如果 Kimi 返回了普通文本，就保存到 content。
      if (message.content) {
        assistantMessage.content = message.content
      }

      // 如果 Kimi 返回了工具调用列表，就保存到 tool_calls。
      if (message.tool_calls && message.tool_calls.length > 0) {
        assistantMessage.tool_calls = message.tool_calls
      }

      // 把 assistant 消息加入当前对话上下文。
      currentMessages = [...currentMessages, assistantMessage]

      // 如果 assistant 消息里包含 tool_calls，执行内部工具函数
      if (message.tool_calls && message.tool_calls.length > 0) {
        // 保存所有工具执行结果。
        const toolResultMessages: Message[] = []

        // 遍历每一个工具调用请求并把结果存入toolResultMessages。
        for (const toolCall of message.tool_calls) {
          // 确保这次工具调用里有 function 信息和函数名。
          if (toolCall.function && toolCall.function.name) {
            let args: any = {}
            try {
              // Kimi 返回的 工具所需参数 通常是字符串。
              // 比如：'{"a":3,"b":5,"op":"add"}'
              // JSON.parse 可以把它转换成对象：{ a: 3, b: 5, op: 'add' }
              args =
                typeof toolCall.function.arguments === 'string'
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments
            } catch (e) {
              console.error('[参数解析失败]', e)
            }
            // 根据工具名和参数执行真正的本地工具函数。
            const result = executeTool(toolCall.function.name, args)
            // 把工具执行结果包装成一条 role 为 tool 的消息。
            toolResultMessages.push({
              id: generateId(),
              role: 'tool',
              name: toolCall.function.name,
              // 工具结果必须转成字符串再放进 content。
              content: JSON.stringify(result),
              // 关键字段：告诉 Kimi 这条工具结果对应哪一次工具调用。
              tool_call_id: toolCall.id,
            })
          }
        }

        // 把工具执行结果加入上下文。
        currentMessages = [...currentMessages, ...toolResultMessages]
        hasMore = false
      } else {
        // 如果没有工具调用，本轮对话结束。
        hasMore = false
      }
    }
    return currentMessages
  }

  // sendMessage 是发送消息的入口函数。
  // 这个函数负责：
  // 1. 读取用户输入。
  // 2. 校验输入是否为空、是否正在加载。
  // 3. 把用户消息先显示到页面。
  // 4. 调用 processConversation 处理完整对话。
  // 5. 成功后更新聊天记录，失败后显示错误。
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

    // 处理请求（调用接口请求函数processConversation ）
    setMessages((prev) => {
      // 把用户消息先显示到页面上。
      const newMessages = [...prev, userMessage]

      ;(async () => {
        try {
          // 当前上下文 = 之前所有消息 + 当前用户消息。
          const currentMessages = [...prev, userMessage]
          // 处理完整对话。
          // 请求 Kimi -> 工具调用 -> 执行工具 -> 再请求 Kimi -> 最终回答。
          const finalMessages = await processConversation(currentMessages)
          // 更新页面消息。
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
      <h2>AI Agent 工具调用</h2>

      {/* 如果 API_KEY 为空，就显示黄色警告框。 */}
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
          警告：API_KEY 为空，请设置有效的 Kimi API Key
        </div>
      )}

      {/* 如果 error 有值，就显示红色错误提示框。 */}
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
