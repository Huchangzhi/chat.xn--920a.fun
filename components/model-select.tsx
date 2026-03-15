"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Model } from "@/lib/models";

// 定义模型配置结构
interface ModelConfig {
  [category: string]: {
    [subCategory: string]: string[];
  };
}

interface ModelSelectProps {
  selectedModel?: Model;
  setSelectedModel: (model: Model) => void;
  models: Model[]; // 保留原接口
}

// 从配置文件加载模型配置
const loadModelConfig = async (): Promise<ModelConfig> => {
  try {
    // 使用完整URL，处理开发和生产环境
    const apiUrl = typeof window !== 'undefined' 
      ? '/api/model-config' 
      : `${process.env.BASE_URL || 'http://localhost:3000'}/api/model-config`;
    const configResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // 添加缓存控制，避免不必要的请求
      cache: 'default'
    });
    
    if (!configResponse.ok) {
      console.error(`Failed to load model config: ${configResponse.status} ${configResponse.statusText}`);
      throw new Error(`HTTP error! status: ${configResponse.status}`);
    }
    
    const config: ModelConfig = await configResponse.json();
    return config;
  } catch (error) {
    console.error("Failed to load model config:", error);
    // 返回默认配置
    return {
      "qwen（推荐）": {
        "normal": [
          "qwen3-max-preview",
          "qwen3-max",
          "qwen3-235b-a22b-instruct"
        ],
        "coder": [
          "qwen3-coder-plus",
          "qwen3-coder",
          "qwen3-coder-flash"
        ],
        "think": [
          "qwen3.5-lts",
          "qwen3-think",
          "qwen3-235b-a22b-thinking-2507",
          "Qwen/QwQ-32B"
        ]
      },
      "glm": {
        "normal": [
          "glm-4-flash"
        ],
        "think": [
          "glm-5",
          "glm-4.7-flash",
          "glm-4.5-air"
        ]
      }
    };
  }
};

// 原有的模型列表组件（保留原有功能）
const ModelList = ({
  models,
  setOpen,
  setSelectedModel,
}: {
  models: Model[];
  setOpen: (open: boolean) => void;
  setSelectedModel: (models: Model) => void;
}) => {
  return (
    <Command>
      <CommandInput placeholder="Filter models..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Models">
          {models.map((model) => (
            <CommandItem
              key={model.id}
              value={model.id}
              onSelect={(value) => {
                setSelectedModel(
                  models.find((m) => m.id === value) ?? models[0],
                );
                setOpen(false);
              }}
            >
              {model.name}
              {model.tag?.map((item) => (
                <Badge key={item} variant="outline" className="ml-auto">
                  {item}
                </Badge>
              ))}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

const ModelSelect = ({ selectedModel, setSelectedModel, models }: ModelSelectProps) => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // 加载模型配置
  if (!config) {
    loadModelConfig().then(setConfig);
  }

  // 获取模型分类
  const getCategories = () => {
    if (!config) return [];
    return Object.keys(config);
  };

  // 获取子分类
  const getSubCategories = (category: string) => {
    if (!config || !config[category]) return [];
    return Object.keys(config[category]);
  };

  // 获取模型列表
  const getModelList = (category: string, subCategory: string) => {
    if (!config || !config[category] || !config[category][subCategory]) return [];
    return config[category][subCategory];
  };

  // 处理旗舰模型选择
  const handleModelSelect = useCallback((modelIds: string[], selectedCat: string, selectedSubCat: string) => {
    // 创建一个包含所有模型ID的数组，以便API可以按顺序尝试
    const newModel: Model = {
      id: modelIds[0] || '', // 使用第一个模型作为显示名称，确保不为undefined
      name: `${selectedCat} (${selectedSubCat})`, // 显示为"旗舰模型 (模式)"的格式
      type: "Text Generation",
      provider: "openai",
    };
    
    // 在模型id中存储整个模型列表，这样API可以按顺序尝试
    (newModel as any).fallbackList = modelIds;
    (newModel as any).selectedCategory = selectedCat;
    (newModel as any).selectedSubCategory = selectedSubCat;
    
    setSelectedModel(newModel);
    localStorage.setItem("CF_AI_MODEL", JSON.stringify(modelIds)); // 存储模型列表
    
    // 保存模型配置用于后续识别
    const config = {};
    if (selectedCat && selectedSubCat) {
      (config as any)[selectedCat] = { [selectedSubCat]: modelIds };
      localStorage.setItem("CF_AI_MODEL_CONFIG", JSON.stringify(config));
    }
    
    localStorage.setItem("CF_AI_MODEL_SELECTED", "true");
    setOpen(false);
    setSelectedCategory(selectedCat);
    setSelectedSubCategory(selectedSubCat);
  }, [setSelectedModel]);

  // 处理普通模型选择（保留原有功能）
  const handleNormalModelSelect = useCallback((model: Model) => {
    setSelectedModel(model);
    localStorage.setItem("CF_AI_MODEL", model.id);
    localStorage.setItem("CF_AI_MODEL_SELECTED", "true"); // 标记用户已手动选择
    setOpen(false);
    setSelectedCategory(null);
    setSelectedSubCategory(null);
  }, [setSelectedModel]);

  // 重置选择
  const resetSelection = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSubCategory(null);
  }, []);

      const ComboBoxContent = () => {
      if (!selectedCategory) {
        // 主界面：显示旗舰模型选项和普通模型列表
        return (
          <Command>
            <CommandInput placeholder="Filter models..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="旗舰模型">
                {getCategories().map((category) => (
                  <CommandItem
                    key={category}
                    value={`category:${category}`}
                    onSelect={() => setSelectedCategory(category)}
                  >
                    {category}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Models">
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={(value) => {
                      const selected = models.find((m) => m.id === value);
                      if (selected) handleNormalModelSelect(selected);
                    }}
                  >
                    {model.name}
                    {model.tag?.map((item) => (
                      <Badge key={item} variant="outline" className="ml-auto">
                        {item}
                      </Badge>
                    ))}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        );
      } else if (!selectedSubCategory) {
        // 第二层：显示子分类
        return (
          <Command>
            <CommandInput placeholder="Filter models..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading={`子分类 - ${selectedCategory}`}>
                {getSubCategories(selectedCategory).map((subCategory) => (
                  <CommandItem
                    key={subCategory}
                    value={`${selectedCategory}:${subCategory}`}
                    onSelect={() => {
                      // 直接选择子分类，应用该子分类下的所有模型
                      handleModelSelect(getModelList(selectedCategory, subCategory), selectedCategory, subCategory);
                    }}
                  >
                    {subCategory}
                  </CommandItem>
                ))}
                <CommandItem
                  key="back-to-main"
                  value="back-to-main"
                  onSelect={() => {
                    // 返回到主选择界面
                    setSelectedCategory(null);
                    setSelectedSubCategory(null);
                  }}
                >
                  ← 返回
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        );
      }
      // 如果已经选择了子分类，就显示主选择界面（因为选择已经完成）
      return (
        <Command>
          <CommandInput placeholder="Filter models..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="旗舰模型">
              {getCategories().map((category) => (
                <CommandItem
                  key={category}
                  value={`category:${category}`}
                  onSelect={() => setSelectedCategory(category)}
                >
                  {category}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Models">
              {models.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={(value) => {
                    const selected = models.find((m) => m.id === value);
                    if (selected) handleNormalModelSelect(selected);
                  }}
                >
                  {model.name}
                  {model.tag?.map((item) => (
                    <Badge key={item} variant="outline" className="ml-auto">
                      {item}
                    </Badge>
                  ))}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      );
    };
  if (isDesktop) {
    return (
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={(newOpen) => {
          setOpen(newOpen);
          // 只有在不是旗舰模型的情况下才重置选择
          const isFlagshipModel = (selectedModel as any)?.selectedCategory && (selectedModel as any)?.selectedSubCategory;
          if (!newOpen && !isFlagshipModel) {
            resetSelection();
          }
        }}>
          <PopoverTrigger asChild>
            {selectedModel && (
              <Button variant="ghost">
                {selectedModel.name}
                <ChevronDown />
              </Button>
            )}
          </PopoverTrigger>
          <PopoverContent className="p-0 w-64" align="start">
            <ComboBoxContent />
          </PopoverContent>
        </Popover>
        {/* 如果当前选择的是旗舰模型，则显示子分类选择器 */}
        {(() => {
          // 检查当前选中的模型是否是旗舰模型
          const isFlagshipModel = (selectedModel as any)?.selectedCategory && (selectedModel as any)?.selectedSubCategory;
          const category = (selectedModel as any)?.selectedCategory || selectedCategory;
          const subCategory = (selectedModel as any)?.selectedSubCategory || selectedSubCategory;
          
          if (isFlagshipModel && category && subCategory) {
            return (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">模式:</span>
                <select
                  value={subCategory}
                  onChange={(e) => {
                    const newSubCategory = e.target.value;
                    
                    if (config) {
                      // 更新模型以反映新的子分类选择
                      const newModel: Model = {
                        id: selectedModel?.id || '', // 确保id不为undefined
                        name: `${category} (${newSubCategory})`, // 更新显示名称
                        type: selectedModel?.type || 'Text Generation', // 确保type不为undefined
                        provider: selectedModel?.provider || 'openai', // 确保provider不为undefined
                        input: selectedModel?.input, // 保留input字段
                        tag: selectedModel?.tag, // 保留tag字段
                      };
                      (newModel as any).selectedSubCategory = newSubCategory; // 更新子分类
                      
                      setSelectedModel(newModel);
                      
                      // 获取新的模型列表并更新本地存储
                      const newModelList = getModelList(category, newSubCategory);
                      if (newModelList.length > 0) {
                        (newModel as any).fallbackList = newModelList;
                        localStorage.setItem("CF_AI_MODEL", JSON.stringify(newModelList));
                        
                        // 更新模型配置存储
                        const newConfig = {};
                        (newConfig as any)[category] = { [newSubCategory]: newModelList };
                        localStorage.setItem("CF_AI_MODEL_CONFIG", JSON.stringify(newConfig));
                      }
                    }
                  }}
                  className="border rounded px-2 py-1 text-sm bg-background"
                >
                  {getSubCategories(category).map((subCategoryOption) => (
                    <option key={subCategoryOption} value={subCategoryOption}>{subCategoryOption}</option>
                  ))}
                </select>
              </div>
            );
          }
          return null;
        })()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Drawer open={open} onOpenChange={(newOpen) => {
        setOpen(newOpen);
        // 只有在不是旗舰模型的情况下才重置选择
        const isFlagshipModel = (selectedModel as any)?.selectedCategory && (selectedModel as any)?.selectedSubCategory;
        if (!newOpen && !isFlagshipModel) {
          resetSelection();
        }
      }}>
        <DrawerTrigger asChild>
          {selectedModel && (
            <Button variant="ghost">
              {selectedModel.name}
              <ChevronDown />
            </Button>
          )}
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle></DrawerTitle>
          <div className="mt-4 px-4 border-t">
            <ComboBoxContent />
          </div>
        </DrawerContent>
      </Drawer>
      {/* 如果当前选择的是旗舰模型，则显示子分类选择器 */}
      {(() => {
        // 检查当前选中的模型是否是旗舰模型
        const isFlagshipModel = (selectedModel as any)?.selectedCategory && (selectedModel as any)?.selectedSubCategory;
        const category = (selectedModel as any)?.selectedCategory || selectedCategory;
        const subCategory = (selectedModel as any)?.selectedSubCategory || selectedSubCategory;
        
        if (isFlagshipModel && category && subCategory) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">模式:</span>
              <select
                value={subCategory}
                onChange={(e) => {
                  const newSubCategory = e.target.value;
                  
                  if (config) {
                                      // 更新模型以反映新的子分类选择
                                      const newModel: Model = {
                                        id: selectedModel?.id || '', // 确保id不为undefined
                                        name: `${category} (${newSubCategory})`, // 更新显示名称
                                        type: selectedModel?.type || 'Text Generation', // 确保type不为undefined
                                        provider: selectedModel?.provider || 'openai', // 确保provider不为undefined
                                        input: selectedModel?.input, // 保留input字段
                                        tag: selectedModel?.tag, // 保留tag字段
                                      };
                    (newModel as any).selectedSubCategory = newSubCategory; // 更新子分类
                    
                    setSelectedModel(newModel);
                    
                    // 获取新的模型列表并更新本地存储
                    const newModelList = getModelList(category, newSubCategory);
                    if (newModelList.length > 0) {
                      (newModel as any).fallbackList = newModelList;
                      localStorage.setItem("CF_AI_MODEL", JSON.stringify(newModelList));
                      
                      // 更新模型配置存储
                      const newConfig = {};
                      (newConfig as any)[category] = { [newSubCategory]: newModelList };
                      localStorage.setItem("CF_AI_MODEL_CONFIG", JSON.stringify(newConfig));
                    }
                  }
                }}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                {getSubCategories(category).map((subCategoryOption) => (
                  <option key={subCategoryOption} value={subCategoryOption}>{subCategoryOption}</option>
                ))}
              </select>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
};

export default ModelSelect;
