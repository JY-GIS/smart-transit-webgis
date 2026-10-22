// 将模型空间法线传递给片元阶段，用来判断当前表面是不是建筑立面。
void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput)
{
    v_normalMC = vsInput.attributes.normalMC;
}