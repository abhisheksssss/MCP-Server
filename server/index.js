import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createPost } from "./mcp.tool.js";
import { string, z } from "zod";
// To install: npm i @tavily/core
import { tavily } from '@tavily/core';

import { completable } from "@modelcontextprotocol/sdk/server/completable.js";


const server = new McpServer({
    name: "example-server",
    version: "1.0.0"
});

// ... set up server resources, tools, and prompts ...

const app = express();


server.tool(
    "addTwoNumbers",
    "Add two numbers",
    {
        a: z.number(),
        b: z.number()
    },
    async (arg) => {
        const { a, b } = arg;
        return {
            content: [
                {
                    type: "text",
                    text: `The sum of ${a} and ${b} is ${a + b}`
                }
            ]
        }
    }
)

server.tool(
    "createPost",
    "Create a post on X formally known as Twitter ", {
    status: z.string()
}, async (arg) => {
    const { status } = arg;
    return createPost(status);
})

server.registerTool(
    "calculate-Bmi",
    {
        title:"BMI calculator",
        description:"Calculate body Mass Index",
        inputSchema:{
            weightKg:z.number(),
            heightM:z.number(),
        }
    },
    async ({weightKg,heightM})=>({
        content:[{
            type:"text",
            text:String(weightKg/(heightM*heightM))
        }]
    })
)

server.registerTool(
    "fetchRealTimeData",
    {
        title:"Realtime Data Fetcher",
        description:"enter query and get real time information about anything",
        inputSchema:{query:z.string()}
    },
    async(arg)=>{
       try {
         const{query}=arg;
 const tvly = tavily({ apiKey: "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" });
 const response = await tvly.search(query)
 
 
 const answer = response?.answer || response?.results?.[0]?.content||"No information founded for this query"
 
         return {
             content:[{type:"text",text:String(answer)}]
         }
       } catch (error) {
        return{
                    content:[{type:"text", text: `Error fetching real-time data: ${error.message}`}]
        }
       }
    }
)


server.registerPrompt(
    "review-code",
    {
        title: "Code Reviewer",
        description: "Review code and provide feedback",
        argsSchema:{code : z.string}
    },
    ({code})=>({

        messages:[{
            role:"user",
            content:{
                type:"text",
                text:`Please review this code:\n\n${code}`
            }
        }]
    })
)


server.registerPrompt(
  "team-greeting",
  {
    title: "Team Greeting",
    description: "Generate a greeting for team members",
    argsSchema: {
      department: completable(z.string(), (value) => {
        // Department suggestions
        return ["engineering", "sales", "marketing", "support"].filter(d => d.startsWith(value));
      }),
      name: completable(z.string(), (value, context) => {
        // Name suggestions based on selected department
        const department = context?.arguments?.["department"];
        if (department === "engineering") {
          return ["Alice", "Bob", "Charlie"].filter(n => n.startsWith(value));
        } else if (department === "sales") {
          return ["David", "Eve", "Frank"].filter(n => n.startsWith(value));
        } else if (department === "marketing") {
          return ["Grace", "Henry", "Iris"].filter(n => n.startsWith(value));
        }
        return ["Guest"].filter(n => n.startsWith(value));
      })
    }
  },
  ({ department, name }) => ({
    messages: [{
      role: "assistant",
      content: {
        type: "text",
        text: `Hello ${name}, welcome to the ${department} team!`
      }
    }]
  })
);








// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports = {};

app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[ transport.sessionId ] = transport;
    res.on("close", () => {
        delete transports[ transport.sessionId ];
    });
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[ sessionId ];
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send('No transport found for sessionId');
    }
});

app.listen(3001, () => {
    console.log("Server is running on http://localhost:3001");
});