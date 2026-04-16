from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.core.config import settings
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.tools.registry import get_available_tools

class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    context: AgentRuntimeContext


async def agent_node(state: GraphState, config: RunnableConfig):
    context = state["context"]
    tools = get_available_tools(context.mode)
    
    from langchain_google_genai import ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(
        model=settings.AGENT_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=1,
        max_retries=2,
        thinking_level = "high"
        
    )
    
    llm_with_tools = llm.bind_tools(tools)
    
    # We pass the full message list to the model.
    # We do NOT yield from here directly since astream_events handles it.
    response = await llm_with_tools.ainvoke(state["messages"], config=config)
    return {"messages": [response]}

def route_tools(state: GraphState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return END
        
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
        
    return END


def build_agent_graph(mode: str, checkpointer=None):
    builder = StateGraph(GraphState)
    tool_node = ToolNode(get_available_tools(mode))
    
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_node)
    
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", route_tools, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")
    
    return builder.compile(checkpointer=checkpointer)
