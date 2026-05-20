package com.moonsonglabs.daml.navigation

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager
import com.intellij.psi.search.FileTypeIndex
import com.intellij.psi.search.GlobalSearchScope
import com.moonsonglabs.daml.DamlFileType
import com.moonsonglabs.daml.workspace.DamlWorkspaceService

@Service(Service.Level.PROJECT)
class DamlModuleResolver(private val project: Project) {
    data class ResolvedModule(val moduleName: String, val file: VirtualFile, val target: PsiElement)

    fun resolve(moduleName: String, contextFile: VirtualFile?): PsiElement? =
        resolveModule(moduleName, contextFile)?.target

    fun resolveImport(import: DamlModuleNames.ImportReference, contextFile: VirtualFile?): PsiElement? {
        if (!import.isSymbolReference()) return resolve(import.moduleName, contextFile)
        return resolveSymbol(import.moduleName, import.symbolName.orEmpty(), contextFile)
            ?: resolve(import.moduleName, contextFile)
    }

    fun resolveSymbol(moduleName: String, symbolName: String, contextFile: VirtualFile?): PsiElement? {
        val module = resolveModule(moduleName, contextFile) ?: return null
        val psiFile = PsiManager.getInstance(project).findFile(module.file) ?: return module.target
        val declaration = DamlModuleNames.declarationNamed(psiFile.text, symbolName) ?: return module.target
        return psiFile.findElementAt(declaration.startOffset) ?: module.target
    }

    fun resolveModule(moduleName: String, contextFile: VirtualFile?): ResolvedModule? {
        val workspace = DamlWorkspaceService.getInstance(project).workspaceFor(contextFile)
        return modules()
            .filter { it.moduleName == moduleName }
            .sortedWith(compareBy<ResolvedModule> {
                val fileWorkspace = DamlWorkspaceService.getInstance(project).workspaceFor(it.file)
                if (workspace != null && fileWorkspace == workspace) 0 else 1
            }.thenBy { it.file.path.length }.thenBy { it.file.path })
            .firstOrNull()
    }

    fun moduleNames(): List<String> =
        modules().map { it.moduleName }.distinct().sorted()

    private fun modules(): List<ResolvedModule> {
        val psiManager = PsiManager.getInstance(project)
        return FileTypeIndex.getFiles(DamlFileType, GlobalSearchScope.projectScope(project))
            .asSequence()
            .filter(::shouldIndex)
            .mapNotNull { file ->
                val psiFile = psiManager.findFile(file) ?: return@mapNotNull null
                val declaration = DamlModuleNames.declaredModule(psiFile.text) ?: return@mapNotNull null
                val target = psiFile.findElementAt(declaration.startOffset) ?: psiFile
                ResolvedModule(declaration.name, file, target)
            }
            .toList()
    }

    private fun shouldIndex(file: VirtualFile): Boolean {
        val path = file.path
        val parts = path.split('/')
        return parts.none {
            it == ".daml" || it == "build" || it == "out" || it == "node_modules" || it == ".gradle"
        }
    }

    companion object {
        fun getInstance(project: Project): DamlModuleResolver = project.service()
    }
}
