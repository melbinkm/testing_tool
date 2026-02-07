"""
Tree generator utility for workspace visualization
"""
import asyncio
from typing import Dict, List, Optional
from pathlib import Path


async def _run_docker_command(container_name: str, command: str) -> Dict[str, any]:
    """Run a command in docker container and return result"""
    try:
        process = await asyncio.create_subprocess_exec(
            "docker", "exec", container_name, "bash", "-c", command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        return {
            "success": process.returncode == 0,
            "stdout": stdout.decode('utf-8', errors='replace').strip(),
            "stderr": stderr.decode('utf-8', errors='replace').strip(),
            "returncode": process.returncode
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1
        }


async def _get_directory_contents(container_name: str, path: str) -> List[Dict[str, any]]:
    """Get contents of a directory with file info"""
    # Use ls with format: type|name|size
    # -p adds / to directories, -1 for one per line
    command = f"cd {path} && ls -1Ap 2>/dev/null || true"
    
    result = await _run_docker_command(container_name, command)
    
    if not result["success"] or not result["stdout"]:
        return []
    
    items = []
    for line in result["stdout"].split('\n'):
        if not line or line in ['./', '../']:
            continue
            
        is_dir = line.endswith('/')
        name = line.rstrip('/')
        
        # Get file count for directories
        count = 0
        if is_dir:
            count_cmd = f"find {path}/{name} -maxdepth 1 -type f 2>/dev/null | wc -l"
            count_result = await _run_docker_command(container_name, count_cmd)
            if count_result["success"]:
                try:
                    count = int(count_result["stdout"].strip())
                except ValueError:
                    count = 0
        
        items.append({
            "name": name,
            "is_dir": is_dir,
            "file_count": count
        })
    
    # Sort: directories first, then by name
    items.sort(key=lambda x: (not x["is_dir"], x["name"]))
    
    return items


async def _get_context_files_detailed(container_name: str, context_path: str) -> List[Dict[str, any]]:
    """Get detailed info about files in context directory"""
    # Get file list with sizes
    command = f"cd {context_path} && ls -lh 2>/dev/null || true"
    
    result = await _run_docker_command(container_name, command)
    
    if not result["success"] or not result["stdout"]:
        return []
    
    files = []
    lines = result["stdout"].split('\n')[1:]  # Skip 'total' line
    
    for line in lines:
        if not line or line.startswith('total'):
            continue
            
        parts = line.split()
        if len(parts) < 9:
            continue
            
        # Parse ls -lh output: permissions links owner group size month day time name
        permissions = parts[0]
        if permissions.startswith('d'):  # Skip directories
            continue
            
        size = parts[4]
        name = ' '.join(parts[8:])  # Handle filenames with spaces
        
        files.append({
            "name": name,
            "size": size
        })
    
    return files


async def generate_workspace_tree(
    container_name: str,
    workspace_path: str,
    max_depth: int = 2,
    show_hidden: bool = False
) -> str:
    """
    Generate ASCII tree structure of workspace
    
    Args:
        container_name: Name of the Exegol container
        workspace_path: Path to workspace (e.g., /workspace/AssessmentName)
        max_depth: Maximum depth to traverse (default: 2)
        show_hidden: Show hidden files (default: False)
    
    Returns:
        Formatted ASCII tree string
    """
    
    # Check if workspace exists
    check_cmd = f"test -d {workspace_path} && echo 'exists' || echo 'not_found'"
    check_result = await _run_docker_command(container_name, check_cmd)
    
    if not check_result["success"] or check_result["stdout"] != "exists":
        return f"Workspace not found: {workspace_path}"
    
    # Start building tree
    tree_lines = [workspace_path]
    
    # Get top-level contents
    items = await _get_directory_contents(container_name, workspace_path)
    
    if not items:
        tree_lines.append("└── (empty)")
        return '\n'.join(tree_lines)
    
    # Standard folders to expect
    standard_folders = ['recon', 'exploits', 'loot', 'notes', 'scripts', 'context']
    
    for idx, item in enumerate(items):
        is_last = idx == len(items) - 1
        prefix = "└──" if is_last else "├──"
        
        if item["is_dir"]:
            # Special handling for context folder - show files
            if item["name"] == "context":
                tree_lines.append(f"{prefix} 📁 {item['name']}/")
                
                context_path = f"{workspace_path}/{item['name']}"
                context_files = await _get_context_files_detailed(container_name, context_path)
                
                if context_files:
                    for fidx, file_info in enumerate(context_files):
                        is_last_file = fidx == len(context_files) - 1
                        file_prefix = "    └──" if is_last else "│   └──" if is_last_file else "│   ├──" if not is_last else "    ├──"
                        
                        tree_lines.append(f"{file_prefix} 📄 {file_info['name']} ({file_info['size']})")
                else:
                    empty_prefix = "    └──" if is_last else "│   └──"
                    tree_lines.append(f"{empty_prefix} (empty)")
            else:
                # For other folders, just show count
                if item["file_count"] > 0:
                    tree_lines.append(f"{prefix} 📁 {item['name']}/ ({item['file_count']} files)")
                else:
                    tree_lines.append(f"{prefix} 📁 {item['name']}/ (empty)")
        else:
            # Regular file in workspace root
            tree_lines.append(f"{prefix} 📄 {item['name']}")
    
    return '\n'.join(tree_lines)


async def get_context_files_list(container_name: str, workspace_path: str) -> List[Dict[str, str]]:
    """
    Get list of context files with metadata
    
    Returns:
        List of dicts with filename, size, and path
    """
    context_path = f"{workspace_path}/context"
    
    # Check if context directory exists
    check_cmd = f"test -d {context_path} && echo 'exists' || echo 'not_found'"
    check_result = await _run_docker_command(container_name, check_cmd)
    
    if not check_result["success"] or check_result["stdout"] != "exists":
        return []
    
    files = await _get_context_files_detailed(container_name, context_path)
    
    result = []
    for file_info in files:
        # Determine file type from extension
        file_ext = Path(file_info["name"]).suffix.lower()
        
        file_type_map = {
            '.pdf': 'PDF Document',
            '.txt': 'Text File',
            '.md': 'Markdown',
            '.json': 'JSON Data',
            '.yaml': 'YAML Config',
            '.yml': 'YAML Config',
            '.xml': 'XML Data',
            '.png': 'Image',
            '.jpg': 'Image',
            '.jpeg': 'Image',
            '.svg': 'SVG Image',
            '.doc': 'Word Document',
            '.docx': 'Word Document',
        }
        
        file_type = file_type_map.get(file_ext, 'File')
        
        result.append({
            "filename": file_info["name"],
            "size_human": file_info["size"],
            "type": file_type,
            "path": f"{context_path}/{file_info['name']}"
        })
    
    return result
