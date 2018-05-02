﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Umbraco.Core.Models.PublishedContent;
using Umbraco.Web.PublishedCache;

namespace Umbraco.Tests.TestHelpers.Stubs
{
    internal class TestPublishedContent : PublishedElement, IPublishedContent
    {
        public TestPublishedContent(PublishedContentType contentType, int id, Guid key, Dictionary<string, object> values, bool previewing, Dictionary<string, PublishedCultureName> cultureNames = null)
            : base(contentType, key, values, previewing)
        {
            Id = id;
            CultureNames = cultureNames;
        }

        public int Id { get; }
        public int TemplateId { get; set; }
        public int SortOrder { get; set; }
        public string Name { get; set; }
        public IReadOnlyDictionary<string, PublishedCultureName> CultureNames { get; set; }
        public string UrlName { get; set; }
        public string DocumentTypeAlias => ContentType.Alias;
        public int DocumentTypeId { get; set; }
        public string WriterName { get; set; }
        public string CreatorName { get; set; }
        public int WriterId { get; set; }
        public int CreatorId { get; set; }
        public string Path { get; set; }
        public DateTime CreateDate { get; set; }
        public DateTime UpdateDate { get; set; }
        public Guid Version { get; set; }
        public int Level { get; set; }
        public string Url { get; set; }
        public PublishedItemType ItemType => ContentType.ItemType;
        public bool IsDraft { get; set; }
        public IPublishedContent Parent { get; set; }
        public IEnumerable<IPublishedContent> Children { get; set; }

        // copied from PublishedContentBase
        public IPublishedProperty GetProperty(string alias, bool recurse)
        {
            var property = GetProperty(alias);
            if (recurse == false) return property;

            IPublishedContent content = this;
            var firstNonNullProperty = property;
            while (content != null && (property == null || property.HasValue() == false))
            {
                content = content.Parent;
                property = content?.GetProperty(alias);
                if (firstNonNullProperty == null && property != null) firstNonNullProperty = property;
            }

            // if we find a content with the property with a value, return that property
            // if we find no content with the property, return null
            // if we find a content with the property without a value, return that property
            //   have to save that first property while we look further up, hence firstNonNullProperty

            return property != null && property.HasValue() ? property : firstNonNullProperty;
        }
    }
}