function reachable(graph, houses, start, steps) {
  const destinations=new Map();
  function walk(node,route) {
    if(route.length===steps||route.length>0&&houses.includes(node)) {
      const existing=destinations.get(node);
      if(!existing||route.length<existing.length)destinations.set(node,[...route]);
    }
    if(route.length===steps)return;
    for(const next of graph[node]||[])walk(next,[...route,next]);
  }
  walk(start,[]);
  return [...destinations].map(([node,route])=>({node,route}));
}
if(typeof module!=='undefined')module.exports={reachable};
if(typeof window!=='undefined')window.routes={reachable};
